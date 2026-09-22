import type { PluginOption } from 'vite'

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { join } from 'node:path'

import { ZipArchive } from 'archiver'

interface ArchiverPluginOptions {
  name?: string
  outputDir?: string
}

async function zip(folderPath: string, outputPath: string): Promise<void> {
  const output = fs.createWriteStream(outputPath)
  const archive = new ZipArchive({
    zlib: { level: 9 }
  })

  archive.on('error', err => {
    throw err
  })

  archive.pipe(output)
  archive.directory(folderPath, false)

  await archive.finalize()
  console.log(`ZIP file created: ${outputPath} (${archive.pointer()} total bytes)`)
}

export default function createViteArchiverPlugin(
  options: ArchiverPluginOptions = {}
): PluginOption {
  const { name = 'dist', outputDir = '.' } = options

  return {
    apply: 'build',
    enforce: 'post',
    name: 'vite:archiver',
    closeBundle: {
      order: 'post',
      async handler() {
        const folder = 'dist'
        const zipOutputDir = join(process.cwd(), outputDir)
        const zipOutputPath = join(zipOutputDir, `${name}.zip`)

        await fsp.mkdir(zipOutputDir, { recursive: true })

        try {
          await zip(folder, zipOutputPath)
          console.log(`Folder has been zipped to: ${zipOutputPath}`)
        } catch (error) {
          console.error('Error zipping folder:', error)
        }
      }
    }
  }
}
