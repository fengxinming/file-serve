/**
 * 服务端国际化工具。
 *
 * 基于 shared/i18n.ts 的 createI18n 工厂构建,与客户端 app/i18n.ts 共用同一套
 * t() 逻辑(签名、占位符插值、回退规则完全一致)。
 *
 * 当前语言为模块级状态,由 createServer / startServer 在启动时通过 setLang
 * 根据 --lang 参数同步,此后 t() 无需再显式传语言。
 */
import { createI18n, isLang, LANGS, resolveLang } from '../../shared/i18n.ts';
import type { Lang } from '../../shared/i18n.ts';
import zhCN from '../i18n/zh-CN.ts';
import en from '../i18n/en.ts';

/** 服务端文案表,按语言分文件维护在 server/i18n/ 下 */
const messages: Record<Lang, Record<string, string>> = { 'zh-CN': zhCN, en };

/** 服务端 i18n 实例(默认中文,启动时按运行参数 setLang) */
const i18n = createI18n(messages, 'zh-CN');

/**
 * 设置服务端当前语言,供日志等文案使用。
 * @param lang 目标语言
 */
export const setLang = i18n.setLang;

/**
 * 读取服务端当前语言。
 * @returns 当前语言
 */
export function getLang(): Lang {
  return i18n.lang;
}

/**
 * 按 key 取服务端文案,支持 {param} 占位符插值(与客户端 t 逻辑一致)。
 * @param key 文案 key,如 'log.title'
 * @param params 可选插值参数
 * @returns 文案文本
 */
export const t = i18n.t;

export { isLang, LANGS, resolveLang };
export type { Lang };
