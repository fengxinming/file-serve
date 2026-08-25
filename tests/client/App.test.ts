// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import App from '../../src/app/App.vue';
import type { FileListResponse } from '../../src/app/types.ts';

const now = Date.now();

function fileList(items: FileListResponse['items'], currentPath = '.', parentPath: string | null = null) {
  return { currentPath, parentPath, items } as FileListResponse;
}

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
      blob: async () => new Blob(['zip']),
    }),
  );
}

function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  stubMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App 文件浏览', () => {
  it('渲染文件列表：文件名、大小、时间、目录图标', async () => {
    mockFetchOnce(
      fileList([
        { name: 'a.txt', path: 'a.txt', isDirectory: false, size: 1024, mtime: now },
        { name: 'sub', path: 'sub', isDirectory: true, size: 0, mtime: now },
      ]),
    );
    const wrapper = mount(App);
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('a.txt');
    expect(text).toContain('1.0 KB'); // formatSize(1024)
    expect(text).toContain('sub');
    expect(wrapper.findAll('.file-row')).toHaveLength(2);
    expect(wrapper.find('.file-row__icon--parent').exists()).toBe(false);
  });

  it('当前路径与父目录行', async () => {
    mockFetchOnce(
      fileList([{ name: 'c.txt', path: 'sub/c.txt', isDirectory: false, size: 10, mtime: now }], 'sub', '.'),
    );
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.browser__path').text()).toBe('sub');
    expect(wrapper.find('.file-row--parent').exists()).toBe(true);
    expect(wrapper.find('.file-row--parent').text()).toContain('..');
  });

  it('下排操作按钮存在', async () => {
    mockFetchOnce(fileList([]));
    const wrapper = mount(App);
    await flushPromises();

    const actions = wrapper.find('.browser__actions').text();
    expect(actions).toContain('批量下载');
    expect(actions).toContain('上传');
  });

  it('空目录显示空态文案', async () => {
    mockFetchOnce(fileList([]));
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.file-list__empty').text()).toBe('空目录');
  });

  it('选中文件后计数与批量下载按钮可用', async () => {
    mockFetchOnce(
      fileList([{ name: 'a.txt', path: 'a.txt', isDirectory: false, size: 10, mtime: now }]),
    );
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.browser__selected').text()).toContain('已选 0 项');
    await wrapper.find('.file-row__check').setValue(true);
    expect(wrapper.find('.browser__selected').text()).toContain('已选 1 项');
  });

  it('接口失败时显示错误文案', async () => {
    mockFetchOnce({ code: 'internalError' }, false, 500);
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.browser__error').text()).toBe('服务器内部错误');
  });
});
