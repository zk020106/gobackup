import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

import createVitePlugins from './plugins'
import { projectInfoPlugin } from './vite.project-info'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL ?? process.env.VITE_BASE_PATH ?? '/',
  plugins: [projectInfoPlugin(process.cwd()), ...createVitePlugins()],
  resolve: {
    alias: {
      '@douyinfe/semi-ui-19/dist/css/semi.css': path.resolve(
        __dirname,
        'node_modules/@douyinfe/semi-ui-19/dist/css/semi.css'
      )
    },
      tsconfigPaths: true
  }
  ,test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 页面测试按「无鉴权模式」编写（没有登录会话时直接进入后台页面），
    // 这里显式声明，避免依赖开发者 shell 里是否设置了 VITE_AUTH_REQUIRED。
    env: {
      VITE_AUTH_REQUIRED: 'false'
    },
    // jsdom 下渲染 Semi UI 整页（Table/Modal/虚拟列表）本身就要几秒，
    // 多个测试文件并行时更容易超过默认的 5s，导致随机失败。
    hookTimeout: 20_000,
    testTimeout: 20_000,
    server: {
      deps: {
        inline: ['@douyinfe/semi-icons', '@douyinfe/semi-ui-19']
      }
    }
  }
})
