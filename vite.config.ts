import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import postcssPxToViewport from 'postcss-px-to-viewport'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [VantResolver()],
      dts: 'app/auto-imports.d.ts'
    }),
    Components({
      resolvers: [VantResolver()],
      dts: 'app/components.d.ts'
    })
  ],
  css: {
    postcss: {
      plugins: [
        // 移动端适配:按 Vant 官方推荐将 px 转 vw,375 设计稿基准
        postcssPxToViewport({
          viewportWidth: 375,
          unitPrecision: 5,
          viewportUnit: 'vw',
          selectorBlackList: [],
          minPixelValue: 1,
          mediaQuery: false
        })
      ]
    }
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true
  }
})
