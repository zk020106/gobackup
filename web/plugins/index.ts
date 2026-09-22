import type { PluginOption } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import babel from '@rolldown/plugin-babel'

import createViteArchiverPlugin from './archiver'
import createViteChunkPlugin from './chunk'

export default function createVitePlugins() {
  const vitePlugins: (PluginOption | PluginOption[])[] = [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ]
  vitePlugins.push(createViteArchiverPlugin())
  vitePlugins.push(
    createViteChunkPlugin({
      splitReact: true,
      bigVendors: [
        '@douyinfe',
        '@tanstack',
        'lucide-react',
        'ahooks',
        'clsx',
        'axios',
        'lodash-es'
      ]
    })
  )

  return vitePlugins
}
