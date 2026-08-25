/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { VantResolver } from '@vant/auto-import-resolver';
import postcssPxtorem from 'postcss-pxtorem';
import { view } from 'vite-plugin-view';
import vitePluginFastify from './vite-plugins/vite-plugin-fastify.ts';
import { createServer } from './src/server/index.ts';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 开发模式语言:读取 .env.local 中的 FS_LANG(默认 zh-CN),与生产 CLI 的 --lang 语义一致
  const env = loadEnv(mode, process.cwd(), '');
  const devLang = env.FS_LANG || 'zh-CN';

  return {
    plugins: [
      // 用模板引擎页面(index.pug)作为页面入口,基于 consolidate 支持 pug/ejs/handlebars 等。
      // 与 vite-plugin-view@6 API 兼容,入口机制适配 Vite 8:真实 .html 壳 + transformIndexHtml 渲染。
      // dev/build 两阶段均由本插件编译,lang 作为模板变量经 engineOptions 注入,产物保持语言无关,
      // 生产环境由服务端启动时用 @fastify/view 加载同一份 index.pug 并以 --lang 覆盖
      view({
        engine: 'pug',
        entry: 'index.pug',
        engineOptions: { lang: devLang },
        logLevel: 'TRACE',
        strategy: {
          build: 'template'
        }
      }),
      vue(),
      AutoImport({
        resolvers: [VantResolver()],
        dts: 'types/auto-imports.d.ts',
      }),
      Components({
        resolvers: [VantResolver()],
        dts: 'types/components.d.ts',
      }),
      vitePluginFastify({ createServer }),
    ],
    css: {
      postcss: {
        plugins: [
          // 移动端适配:px 转 rem,1rem = 16px 基准(html 根字号 clamp 封顶,桌面端最大 1.5x)
          // 排除:border 系列(保护 Vant 1px hairline 细线)、定位偏移、CSS 变量(阴影等保持物理值)
          postcssPxtorem({
            rootValue: 16,
            unitPrecision: 5,
            propList: [
              '*',
              '!--*',
              '!border',
              '!border-width',
              '!border-style',
              '!border-color',
              '!border-top',
              '!border-right',
              '!border-bottom',
              '!border-left',
              '!top',
              '!right',
              '!bottom',
              '!left',
              '!z-index',
              '!flex-basis',
            ],
            // 排除 html 根字号规则本身,防止 font-size 转 rem 形成循环依赖
            selectorBlackList: [/^html$/],
            // 媒体查询条件(max-width: 640px)保持物理像素
            mediaQuery: false,
            minPixelValue: 1,
          }),
        ],
      },
    },
    build: {
      outDir: 'dist/app',
      emptyOutDir: true,
      // 生成构建清单,服务端启动时据此解析 hash 后的 JS/CSS 入口路径作为 pug 模板变量
      manifest: true,
    },
    // vitest 单测配置:与业务构建共享同一份 vite 配置,不再单独维护 vitest.config.ts
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      server: {
        deps: {
          // vant 默认被外部化(直接走 Node 原生 import),其内部的 .css 导入会报
          // Unknown file extension;强制 inline 让 Vite 转换,配合下方 css 处理样式
          inline: ['vant'],
        },
      },
      // vant 组件包会 import 样式文件,测试中需要允许 CSS 导入
      css: true,
    },
  };
});
