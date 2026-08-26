/**
 * node 侧编译 client 测试时需要 window 声明（真实 window 只在浏览器环境存在）。
 * app/i18n.ts 的 `declare global` 会与此处的全局声明合并。
 */
declare const window: Window;

interface Window {
  __FS_LANG__?: string;
}
