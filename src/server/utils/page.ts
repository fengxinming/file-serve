/**
 * 服务端页面渲染相关工具。
 *
 * - 生产模式（推荐）:由 server/index.ts 注册 @fastify/view,通过 reply.view('index.pug', locals)
 *   渲染,本文件仅提供 locateTemplate(定位模板)与 resolveEntryAssets(解析构建产物入口路径)
 *   两个辅助函数;
 *
 * 模板与前端共用同一份 index.pug:
 * - vite 侧(开发 / 构建):vite-plugin-view 的 engineOptions.lang 注入开发语言,入口由 vite 替换
 *   为 hash 资源;
 * - 服务端侧:lang 取 --lang 参数,entryJs / entryCss 从构建产物扫描得出。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from '../../shared/i18n.ts';

/** 模板渲染参数(与 index.pug 中使用的变量一一对应) */
export interface PageParams {
  /** 界面语言 */
  lang: Lang;
  /** 前端入口 JS 路径(相对站点根,如 /assets/index-xxx.js) */
  entryJs: string;
  /** 前端入口 CSS 路径(相对站点根,可能为空) */
  entryCss: string;
}

/**
 * 从构建产物目录扫描入口 JS/CSS 资源路径。
 * 生产构建由 vite 生成 hash 文件名(如 /assets/index-B_5F_1dQ.js、/assets/index-CzwUVfTc.css),
 * 服务端据此拼出相对站点根的路径,作为 pug 模板变量传入。
 * @param staticDir 前端静态资源目录(如 dist/web)
 * @returns 入口 JS/CSS 的相对路径
 */
export function resolveEntryAssets(staticDir: string): { entryJs: string; entryCss: string } {
  const assetsDir = join(staticDir, 'assets');
  let js = '';
  let css = '';
  if (existsSync(assetsDir)) {
    for (const file of readdirSync(assetsDir)) {
      if (js && css) {
        break;
      }
      if (!js && /^index-.*\.js$/.test(file)) {
        js = file;
      }
      if (!css && /^index-.*\.css$/.test(file)) {
        css = file;
      }
    }
  }
  // 找不到入口 JS 时兜底指向源码入口,便于误删构建产物时给出可读报错而非白屏
  if (!js) {
    throw new Error(`构建产物中找不到入口 JS(目录:${assetsDir}),请先执行 pnpm build`);
  }
  return {
    entryJs: `/assets/${js}`,
    entryCss: css ? `/assets/${css}` : '',
  };
}
