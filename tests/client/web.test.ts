// @vitest-environment happy-dom
/**
 * 构建产物级页面测试:服务启动后加载完整页面,校验真实渲染结果。
 *
 * 流程:启动真实 file-serve 服务(含真实文件)→ 请求完整页面 HTML →
 * 注入 DOM 环境并手动执行 dist/web 打包 JS 让 Vue 真实挂载 →
 * 页面真实请求 /api/files → 断言文件列表有记录、下排有按钮。
 * 依赖 pnpm test 的 pretest 先构建最新产物(见 package.json)。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createServer } from '../../src/server/index.ts';

let server: Awaited<ReturnType<typeof createServer>>;
let root: string;
let baseUrl: string;

/**
 * 向上探测 dist/web 构建产物目录。
 * @param from 起始路径(通常为当前文件路径)
 * @returns dist/web 的绝对路径
 * @throws 未找到构建产物时抛出错误(提示先执行 pnpm build)
 */
function findDistWeb(from: string): string {
  let dir = dirname(from);
  for (;;) {
    const candidate = resolve(dir, 'dist/app');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('找不到 dist/app,请先执行 pnpm build');
    dir = parent;
  }
}

beforeAll(async () => {
  // 准备一个含真实文件的根目录作为服务数据源
  root = mkdtempSync(join(tmpdir(), 'file-serve-web-'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'hello.txt'), 'hello file-serve');
  writeFileSync(join(root, 'docs/readme.md'), '# readme');

  // 启动服务:staticDir 指向构建产物,提供完整页面;同时提供 /api 接口
  server = await createServer({ root }, findDistWeb(import.meta.url));
  await server.listen({ host: '127.0.0.1', port: 0 });
  const address = server.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('服务启动后加载完整页面', () => {
  it('文件列表有记录,下排有按钮', async () => {
    // 1. 从服务获取完整页面 HTML(含注入的 __FS_LANG__)
    const pageRes = await fetch(`${baseUrl}/`);
    expect(pageRes.status).toBe(200);
    const html = await pageRes.text();
    expect(html).toContain('<div id="app"></div>');

    // 2. 将页面注入 DOM 环境。剥离 module script 与 stylesheet,避免 happy-dom
    //    自动加载外部资源报错;打包 JS 稍后手动执行
    const cleanHtml = html
      .replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/gi, '')
      .replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi, '');
    document.open();
    document.write(cleanHtml);
    document.close();
    // 默认语言与服务注入一致(未传 --lang,默认 zh-CN)
    window.__FS_LANG__ = 'zh-CN';

    // 3. 页面运行所需的浏览器能力
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

    // 4. 页面内的 fetch 走真实网络,相对路径拼到本服务
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      realFetch(new URL(String(input), `${baseUrl}/`).href, init),
    );

    // 5. 执行构建产物中的打包 JS,让 Vue 真实挂载渲染
    const scriptSrc = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
    expect(scriptSrc).toBeTruthy();
    const jsPath = join(findDistWeb(import.meta.url), scriptSrc!.replace(/^\//, ''));
    await import(pathToFileURL(jsPath).href);

    // 6. 等待页面渲染完成:文件列表出现记录
    await vi.waitFor(
      () => {
        expect(document.querySelectorAll('.file-row').length).toBeGreaterThan(0);
      },
      { timeout: 8000 },
    );

    // 文件列表有记录:真实接口返回了目录与文件
    const bodyText = document.body.textContent ?? '';
    expect(document.querySelectorAll('.file-row').length).toBeGreaterThanOrEqual(2);
    expect(bodyText).toContain('docs');
    expect(bodyText).toContain('hello.txt');

    // 下排有按钮:批量下载 / 上传
    const actions = document.querySelector('.browser__actions');
    expect(actions).not.toBeNull();
    expect(actions!.textContent).toContain('批量下载');
    expect(actions!.textContent).toContain('上传');
  });
});
