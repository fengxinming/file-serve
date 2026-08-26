/**
 * file-serve 服务端:Fastify 应用工厂与启动入口。
 *
 * - createServer:组装路由(文件浏览 / 下载 / 批量下载 / tus 上传);当传入 staticDir 时额外注册
 *   生产端的页面与静态资源:用 @fastify/view 加载 pug 模板,reply.view() 传入 lang / 构建入口路径
 *   作为 locals,由 @fastify/static 提供前端静态文件;
 * - startServer:解析端口与监听地址,启动服务并打印访问地址。
 *
 * 开发模式不走本入口的首页渲染逻辑,而是由根目录 devServer.ts 通过 @fastify/vite 挂载
 * vite dev server(含 vite-plugin-view 编译 index.pug),因此 createServer 被 devServer.ts
 * 调用时不传 staticDir,@fastify/view 与 @fastify/static 的注册会整体跳过。
 */
import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import pug from 'pug';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import open from 'open';
import { findAvailablePort, getLocalIP } from './utils/port.ts';
import { resolveLang, setLang, t } from './utils/lang.ts';
import { resolveEntryAssets } from './utils/page.ts';
import { setupFileRoutes } from './routes/files.ts';
import { setupUploadRoutes } from './routes/upload.ts';
import type { FastifyInstance } from 'fastify';
import type { CreateServerOptions, ServerOptions } from './types.d.ts';


/**
 * 创建 Fastify 应用实例。
 * @param options 服务选项(根目录、调试、CORS、压缩、语言等)
 * @param staticDir 前端静态资源目录;提供时才注册首页渲染与静态资源服务
 * @returns 已组装完成的 Fastify 实例
 */
export async function createServer(options: CreateServerOptions = {}, staticDir?: string): Promise<FastifyInstance> {
  const {
    root = process.cwd(),
    debug = false,
    cors = true,
    compress = false,
    lang: rawLang,
  } = options;
  const lang = resolveLang(rawLang);
  // 同步服务端文案当前语言,后续 t() 直接取当前语言,无需再显式传参
  setLang(lang);

  // 上传临时目录(tus 分片暂存地),不存在则创建
  const uploadDir = resolve(root, '.uploads');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  } 

  const server = fastify({ logger: debug, routerOptions: { ignoreTrailingSlash: true } });

  // CORS:允许任意来源跨域访问(桌面端默认开启)
  if (cors) {
    await server.register(fastifyCors, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Upload-*', 'Tus-*'],
    });
  }

  // 首页渲染与静态资源服务(仅生产模式 / CLI 启动时提供;开发模式由 @fastify/vite 接管)
  if (staticDir) {
    if (!existsSync(staticDir)) {
      throw new Error(`"${staticDir}" Not exists.`);
    }

    // 1) 定位模板文件与前端构建入口(hash JS/CSS 路径)
    const { entryJs, entryCss } = resolveEntryAssets(staticDir);

    // 2) 注册 @fastify/view + pug 引擎,模板根目录锁定到 index.pug 所在目录;
    //    production 默认会缓存编译后的 pug 模板函数
    await server.register(fastifyView, {
      engine: { pug },
      root: staticDir
    });

    // 3) / 路由:用 reply.view 渲染同一份 index.pug,
    //    lang / entryJs / entryCss 作为 pug 模板变量传入(与 index.pug 中变量名严格对齐)
    server.get('/', (_req, reply) => {
      return reply.view('index.pug', {
        lang,
        entryJs,
        entryCss,
      });
    });

    // 其余静态资源(assets/js/css/svg 等)由 @fastify/static 提供;
    // index:false 使 / 不被 static 的默认 index 逻辑接管,交由上方自定义路由渲染
    await server.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      decorateReply: false,
      index: false,
    });
  }

  // 文件路由与上传路由
  await setupFileRoutes(server, { root, compress });
  await setupUploadRoutes(server, { uploadDir, root });

  return server;
}

/**
 * 启动服务:解析可用端口、打印访问地址,并按需打开浏览器。
 * @param options 启动选项(端口、监听地址、是否打开浏览器等)
 * @param staticDir 前端静态资源目录
 * @returns 已监听的 Fastify 实例
 */
export async function startServer(options: ServerOptions, staticDir?: string): Promise<FastifyInstance> {
  const { port = 3000, listen = '0.0.0.0', open: shouldOpen = false } = options;

  // 语言在 createServer 内部已按 --lang 同步,日志文案直接 t() 即可
  const server = await createServer(options, staticDir);

  // 端口被占用时自动向后探测可用端口
  const availablePort = await findAvailablePort(port);
  const host = listen === '0.0.0.0' ? '0.0.0.0' : listen;
  const localUrl = `http://localhost:${availablePort}`;
  const networkUrl = `http://${getLocalIP()}:${availablePort}`;

  await server.listen({ host, port: availablePort });

  // 启动信息:标题、根目录、本机地址与局域网地址
  console.info(`\n📁 ${t('log.title')}`);
  console.info(`📍 ${t('log.root')}: ${options.root ?? process.cwd()}`);
  console.info(`🌐 ${t('log.local')}: ${localUrl}`);
  console.info(`📱 ${t('log.lan')}: ${networkUrl}`);
  if (options.debug) console.info(`🐛 ${t('log.debug')}`);

  // 自动打开默认浏览器
  if (shouldOpen) await open(localUrl);

  return server;
}
