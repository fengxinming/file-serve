/**
 * 国际化共享核心:客户端与服务端共用的语言解析与文案逻辑。
 *
 * 客户端(app/i18n.ts)与服务端(server/utils/lang.ts)都通过本模块的
 * createI18n 工厂各自创建实例,保证两端 t() 的签名、{param} 占位符插值规则、
 * 未知 key 的回退规则完全一致,避免两套实现产生行为差异。
 *
 * 本模块为纯逻辑实现,不依赖 DOM / Node 环境,两端均可直接引用。
 */

/** 支持的语言列表:新增语言只需在此追加一项,并在各端 locales/ 下补充对应文案 */
export const LANGS = ['zh-CN', 'en'] as const;

/** 界面语言,由 LANGS 派生,保证单一数据源 */
export type Lang = (typeof LANGS)[number];

/** 文案表:语言 → 文案 key → 文案文本 */
export type Messages = Record<string, string>;

/** 文案集合:按语言分组,需覆盖 LANGS 中的每种语言 */
export type MessageSet = Record<Lang, Messages>;

/**
 * 校验值是否为受支持的语言。
 * @param value 待校验值(通常来自 CLI 参数或页面注入的启动参数)
 * @returns 是受支持语言时收窄为 Lang 类型
 */
export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * 解析语言,非法值回退默认语言。
 * @param value 待解析值
 * @param fallback 回退语言,默认 zh-CN
 * @returns 合法语言值,否则返回 fallback
 */
export function resolveLang(value: unknown, fallback: Lang = 'zh-CN'): Lang {
  return isLang(value) ? value : fallback;
}

/** i18n 实例接口 */
export interface I18n {
  /** 当前语言(只读) */
  readonly lang: Lang;

  /** 切换当前语言 */
  setLang(lang: Lang): void;

  /**
   * 按 key 取文案。
   * 查找顺序:当前语言 → 默认语言(zh-CN) → 原样返回 key。
   * @param key 文案 key,如 'log.title'
   * @param params 可选插值参数,文案中的 {name} 会被替换为对应值
   * @returns 文案文本
   */
  t(key: string, params?: Record<string, string | number>): string;
}

/**
 * 创建 i18n 实例。
 * @param messages 文案集合,需覆盖 LANGS 中的每种语言
 * @param initialLang 初始语言
 * @returns i18n 实例
 */
export function createI18n(messages: MessageSet, initialLang: Lang): I18n {
  let lang = initialLang;

  return {
    get lang(): Lang {
      return lang;
    },

    setLang(next: Lang): void {
      lang = next;
    },

    t(key: string, params?: Record<string, string | number>): string {
      // 回退链:当前语言 → 默认语言(zh-CN) → 原样返回 key
      let text = messages[lang][key] ?? messages['zh-CN'][key] ?? key;
      if (params) {
        // 用 {name} 占位符做插值,值统一转为字符串
        for (const [name, value] of Object.entries(params)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
  };
}
