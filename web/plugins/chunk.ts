import type { PluginOption } from 'vite'

interface ChunkPluginOptions {
  splitReact?: boolean
  bigVendors?: string[]
}

interface ChunkGroup {
  name: string
  test: RegExp
  priority: number
}

export default function createViteChunkPlugin(options: ChunkPluginOptions = {}): PluginOption {
  const { splitReact = true, bigVendors = [] } = options

  return {
    name: 'vite:chunk',
    apply: 'build',
    enforce: 'post',
    config() {
      const groups: ChunkGroup[] = []
      let priority = 100

      if (splitReact) {
        groups.push({
          name: 'vendor-react',
          test: /\/node_modules\/(react|react-dom|scheduler)\//,
          priority: priority--
        })
      }

      for (const vendor of bigVendors) {
        const chunkName = `vendor-${vendor.replace(/^@/, '').replaceAll('/', '-')}`
        const escapedPath = vendor.replace(/^@/, '\\@').replaceAll('/', '\\/')

        groups.push({
          name: chunkName,
          test: new RegExp(`\\/node_modules\\/${escapedPath}\\/`),
          priority: priority--
        })
      }

      groups.push({
        name: 'vendor',
        test: /\/node_modules\//,
        priority: 0
      })

      return {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups
              }
            }
          }
        }
      }
    }
  }
}
