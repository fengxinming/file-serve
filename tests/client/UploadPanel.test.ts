// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import UploadPanel from '../../src/app/components/UploadPanel.vue';

// tus 上传在测试中不真正发起网络请求
vi.mock('tus-js-client', () => ({
  Upload: vi.fn(),
}));

function mountPanel() {
  return mount(UploadPanel, {
    props: { modelValue: true },
    global: {
      stubs: {
        // van-popup 默认 teleport 到 body，stub 为普通容器以便断言内部内容
        'van-popup': defineComponent({
          props: ['show'],
          template: '<div class="van-popup-stub"><slot /></div>',
        }),
      },
    },
    attachTo: document.body,
  });
}

function selectFiles(wrapper: ReturnType<typeof mountPanel>, names: string[]) {
  const input = wrapper.find('input[type="file"]').element as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: names.map(
      (n) => new File([n], n, { type: 'text/plain' }),
    ),
    configurable: true,
  });
  return input.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('UploadPanel 上传面板', () => {
  it('初始为空态，显示空文案', async () => {
    const wrapper = mountPanel();
    expect(wrapper.find('.upload-panel__empty').text()).toBe('尚未选择文件');
    wrapper.unmount();
  });

  it('选择文件后渲染任务列表（文件名/大小/待上传）', async () => {
    const wrapper = mountPanel();
    selectFiles(wrapper, ['a.txt', 'b.txt']);
    await flushPromises();

    const taskNames = wrapper.findAll('.upload-task__name').map((w) => w.text());
    expect(taskNames).toEqual(['a.txt', 'b.txt']);
    // 状态为待上传
    expect(wrapper.findAll('.upload-task__status')[0].text()).toBe('待上传');
    wrapper.unmount();
  });

  it('选择文件后“全部上传”按钮可用', async () => {
    const wrapper = mountPanel();
    selectFiles(wrapper, ['a.txt']);
    await flushPromises();

    const startBtn = wrapper
      .findAll('button')
      .find((w) => w.text().includes('全部上传'))!;
    expect(startBtn.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('未选文件时“全部上传”按钮禁用', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    const startBtn = wrapper
      .findAll('button')
      .find((w) => w.text().includes('全部上传'))!;
    expect(startBtn.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
