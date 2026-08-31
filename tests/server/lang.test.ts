/**
 * 服务端国际化工具测试。
 *
 * 覆盖 LANGS / isLang / resolveLang 与 t 的取词与回退逻辑。
 * t 基于共享 i18n 核心(shared/i18n.ts),当前语言由 setLang 同步,
 * 与客户端 app/i18n.ts 的 t 行为一致。
 */
import { describe, expect, it } from 'vitest';
import { isLang, LANGS, resolveLang, setLang, t } from '../../src/server/utils/lang.ts';

describe('lang 工具', () => {
  it('LANGS 只含受支持语言', () => {
    expect(LANGS).toEqual(['en', 'zh-CN']);
  });

  it('isLang 识别受支持语言', () => {
    expect(isLang('zh-CN')).toBe(true);
    expect(isLang('en')).toBe(true);
  });

  it('isLang 拒绝非法值', () => {
    expect(isLang('ja')).toBe(false);
    expect(isLang('')).toBe(false);
    expect(isLang(undefined)).toBe(false);
    expect(isLang(null)).toBe(false);
  });

  it('resolveLang 通过合法值', () => {
    expect(resolveLang('zh-CN')).toBe('zh-CN');
    expect(resolveLang('en')).toBe('en');
  });

  it('resolveLang 非法值回退 zh-CN', () => {
    expect(resolveLang('ja')).toBe('zh-CN');
    expect(resolveLang(undefined)).toBe('zh-CN');
  });

  it('t 返回对应语言文案', () => {
    // 切换语言后 t 直接取当前语言,无需再显式传参
    setLang('zh-CN');
    expect(t('log.title')).toBe('lansrv 已启动');
    setLang('en');
    expect(t('log.title')).toBe('lansrv started');
  });

  it('t 未知 key 原样返回', () => {
    setLang('zh-CN');
    expect(t('no.such.key')).toBe('no.such.key');
    setLang('en');
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
