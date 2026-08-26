/**
 * Vite 插件:开发模式下将 fastify 服务挂载进 vite dev server(单端口)。
 * - /api 前缀请求透传给 fastify(复用 createServer 注册的全部路由);
 * - 其余请求继续走 vite(前端静态资源 / HMR)。
 *
 * 仅 apply: 'serve' 生效,不参与构建(build)。页面模板 index.pug 由
 * vite-plugin-view 编译,语言 lang 作为模板变量经 engineOptions 注入(见 vite.config.ts),
 * 因此本插件不再做运行时字符串注入,与生产端"启动时编译 pug 传参"行为保持一致。
 */
import type { Plugin } from 'vite';
import type { FastifyInstance } from 'fastify';

export interface Options {
  createServer: () => FastifyInstance | Promise<FastifyInstance>  
}

/**
 * 创建 vite-plugin-fastify 插件。
 * @param options 服务选项(与 createServer 一致,含 lang)
 * @returns Vite 插件对象
 */
export default function vitePluginFastify({ createServer }: Options): Plugin {
  let fastify: FastifyInstance | null = null;

  return {
    name: 'vite-plugin-fastify',
    apply: 'serve',

    async configureServer(server) {
      fastify = await Promise.resolve(createServer());
      // 完成 fastify 初始化(触发 preReady,初始化各路由的 hook 上下文),否则请求会崩
      await fastify.ready();

      // /api 请求透传给 fastify:直接转发原生 req/res,支持大文件流式上传/下载
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api')) return next();
        fastify!.server.emit('request', req, res);
      });

      // vite dev server 关闭时同步清理 fastify(tus 单例等资源)。
      // post hook 执行时 httpServer 已创建,但类型上仍可能为 null,需判空
      return () => {
        server.httpServer?.once('close', () => {
          fastify?.close().catch(() => {});
          fastify = null;
        });
      };
    },
  };
}
