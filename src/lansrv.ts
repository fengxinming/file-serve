#!/usr/bin/env node
/**
 * lansrv CLI 入口。
 *
 * 解析命令行参数(端口、监听地址、语言等),启动服务并加载 dist/web 构建产物。
 * 界面语言由运行参数 --lang 决定,服务端启动时编译 index.pug 并注入,不随构建产物预编译。
 */
import { cac } from 'cac';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { LANGS } from './server/utils/lang.ts';
import { startServer } from './server/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

const cli = cac('lansrv');

cli
  .option('-p, --port <port>', '端口号', { default: 3000 })
  .option('-l, --listen <listen>', '监听地址', { default: '0.0.0.0' })
  .option('-o, --open', '自动打开浏览器', { default: false })
  .option('-d, --debug', '调试模式', { default: false })
  .option('-C, --cors', '启用 CORS', { default: true })
  .option('-c, --compress', '启用 gzip 压缩', { default: false })
  .option('-L, --lang <lang>', `网页界面语言: ${LANGS.join(' | ')}`, { default: LANGS[0] })
  .help()
  .version(pkg.version);

cli.parse();

// 解析 CLI 参数:根目录为第一个位置参数,缺省取当前工作目录
const { options } = cli;
const root = cli.args[0] || process.cwd();

startServer(
  {
    port: options.port,
    listen: options.listen,
    open: options.open,
    debug: options.debug,
    cors: options.cors,
    compress: options.compress,
    lang: options.lang,
    root,
  },
  join(__dirname, 'app'),
);
