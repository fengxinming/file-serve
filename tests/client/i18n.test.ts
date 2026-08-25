/**
 * 前端 i18n 测试。
 * 覆盖语言读取(window.__FS_LANG__ 注入)、回退、占位符插值与未知 key 行为。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('前端 i18n', () => {
  beforeEach(() => {
    // 清模块缓存,让动态 import 时重新读取注入的语言
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('未注入语言时默认 zh-CN', async () => {
    vi.stubGlobal('window', { __FS_LANG__: undefined });
    const { lang, t } = await import('../../src/app/i18n.ts');
    expect(lang).toBe('zh-CN');
    expect(t('empty.dir')).toBe('空目录');
    expect(t('internalError')).toBe('服务器内部错误');
  });

  it('注入 en 时使用英文文案', async () => {
    vi.stubGlobal('window', { __FS_LANG__: 'en' });
    const { lang, t } = await import('../../src/app/i18n.ts');
    expect(lang).toBe('en');
    expect(t('empty.dir')).toBe('Empty directory');
    expect(t('internalError')).toBe('Internal server error');
  });

  it('注入非法语言时回退 zh-CN', async () => {
    vi.stubGlobal('window', { __FS_LANG__: 'ja' });
    const { lang } = await import('../../src/app/i18n.ts');
    expect(lang).toBe('zh-CN');
  });

  it('占位符插值', async () => {
    vi.stubGlobal('window', { __FS_LANG__: 'zh-CN' });
    const { t } = await import('../../src/app/i18n.ts');
    expect(t('selected.count', { n: 3 })).toBe('已选 3 项');
    expect(t('load.failed', { code: 500 })).toBe('加载失败 (500)');
  });

  it('未知 key 原样返回', async () => {
    vi.stubGlobal('window', { __FS_LANG__: 'zh-CN' });
    const { t } = await import('../../src/app/i18n.ts');
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
