/**
 * 前端国际化。
 *
 * 基于 shared/i18n.ts 的 createI18n 工厂构建,与服务端 server/utils/lang.ts
 * 共用同一套 t() 逻辑(签名、占位符插值、回退规则完全一致)。
 *
 * 语言由服务运行时注入的 window.__FS_LANG__ 决定(见 shared/i18n.ts 的
 * injectLang),页面加载时读取一次,非法值回退默认语言(zh-CN)。
 */
import { createI18n, isLang } from '../shared/i18n.ts';
import zhCN from './locales/zh-CN.ts';
import en from './locales/en.ts';

declare global {
  interface Window {
    __FS_LANG__?: string;
  }
}

/** 前端界面文案表,按语言分文件维护在 app/locales/ 下 */
const messages = { 'zh-CN': zhCN, en };

/** 前端 i18n 实例:从页面注入的启动参数读取语言,非法值回退 zh-CN */
const i18n = createI18n(messages, isLang(window.__FS_LANG__) ? window.__FS_LANG__ : 'zh-CN');

/** 当前界面语言 */
export const lang = i18n.lang;

/**
 * 按 key 取文案,支持 {param} 占位符插值(与服务端 t 逻辑一致)。
 * @param key 文案 key,如 'empty.dir'
 * @param params 可选插值参数
 * @returns 文案文本
 */
export const t = i18n.t;
