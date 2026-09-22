import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const projectInfoModuleId = 'virtual:admin-project-info'
const resolvedProjectInfoModuleId = `\0${projectInfoModuleId}`

interface PackageJson {
  author?: string | { email?: string; name?: string; url?: string }
  dependencies?: Record<string, string>
  description?: string
  devDependencies?: Record<string, string>
  homepage?: string
  license?: string
  name?: string
  packageManager?: string
  repository?: string | { directory?: string; type?: string; url?: string }
  version?: string
}

interface WorkspacePackage {
  directory: string
  packageJson: PackageJson
}

interface WorkspaceManifest {
  catalog: Record<string, string>
  packages: string[]
}

/**
 * 创建关于页项目信息虚拟模块，构建期解析 workspace package 信息。
 *
 * @param startDirectory - 查找 monorepo 根目录的起始目录。
 * @returns Vite 插件。
 */
export function projectInfoPlugin(startDirectory: string): Plugin {
  return {
    name: 'admin-project-info',
    resolveId(id) {
      if (id === projectInfoModuleId) {
        return resolvedProjectInfoModuleId
      }

      return undefined
    },
    load(id) {
      if (id !== resolvedProjectInfoModuleId) {
        return undefined
      }

      const root = findMonorepoRoot(startDirectory)
      const packagePath = path.join(root, 'package.json')
      const workspacePath = path.join(root, 'pnpm-workspace.yaml')
      if (existsSync(packagePath)) this.addWatchFile(packagePath)
      if (existsSync(workspacePath)) this.addWatchFile(workspacePath)

      const projectInfo = resolveProjectInfo(root)

      return `const projectInfo = ${JSON.stringify(projectInfo)};\nexport { projectInfo };\nexport default projectInfo;\n`
    }
  }
}

function findMonorepoRoot(startDirectory: string) {
  let current = startDirectory
  let nearestPackageRoot = startDirectory

  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current
    }

    if (existsSync(path.join(current, 'package.json'))) {
      nearestPackageRoot = current
    }

    const parent = path.dirname(current)

    if (parent === current) {
      return nearestPackageRoot
    }

    current = parent
  }
}

function resolveProjectInfo(root: string) {
  const packages = getWorkspacePackages(root)
  const rootPackage = readPackageJson(path.join(root, 'package.json'))
  const manifest = readWorkspaceManifest(root)
  const packageVersions = Object.fromEntries(
    packages
      .map(({ packageJson }) => [packageJson.name, packageJson.version] as const)
      .filter(([name]) => Boolean(name))
  )
  const dependencies = resolveDependencyRecord(packages, 'dependencies', packageVersions, manifest)
  const devDependencies = resolveDependencyRecord(
    packages,
    'devDependencies',
    packageVersions,
    manifest
  )
  const repositoryUrl = resolveRepositoryUrl(rootPackage.repository)

  return {
    dependencyGroups: [
      {
        dependencies: toDependencyList(dependencies),
        description: '从 workspace package.json 解析出的运行时依赖。',
        title: '生产环境依赖',
        type: 'dependencies'
      },
      {
        dependencies: toDependencyList(devDependencies),
        description: '从 workspace package.json 解析出的开发、构建和测试依赖。',
        title: '开发环境依赖',
        type: 'devDependencies'
      }
    ],
    description:
      rootPackage.description || 'GoBackup Web 管理界面。',
    meta: [
      { label: '包名', value: rootPackage.name || path.basename(root) },
      { label: '版本号', value: rootPackage.version || '0.0.0' },
      { label: '开源许可协议', value: rootPackage.license || 'MIT' },
      { label: '包管理器', value: rootPackage.packageManager || 'pnpm' },
      { label: '最后构建时间', value: formatBuildTime(new Date()) },
      { href: rootPackage.homepage, label: '主页', value: rootPackage.homepage || '-' },
      { href: repositoryUrl, label: '仓库', value: repositoryUrl || '-' },
      { label: '作者', value: resolveAuthor(rootPackage.author) }
    ],
    name: rootPackage.name || path.basename(root),
    packageManager: rootPackage.packageManager || 'pnpm',
    version: rootPackage.version || '0.0.0'
  }
}

function getWorkspacePackages(root: string): WorkspacePackage[] {
  const rootPackagePath = path.join(root, 'package.json')
  const rootPackage = readPackageJson(rootPackagePath)
  const manifest = readWorkspaceManifest(root)
  const packageDirectories = new Set([root])

  for (const pattern of manifest.packages) {
    for (const directory of expandWorkspacePattern(root, pattern)) {
      packageDirectories.add(directory)
    }
  }

  return [...packageDirectories]
    .map(directory => ({
      directory,
      packageJson:
        directory === root ? rootPackage : readPackageJson(path.join(directory, 'package.json'))
    }))
    .filter(({ packageJson }) => Boolean(packageJson.name))
}

function expandWorkspacePattern(root: string, pattern: string) {
  if (!pattern || pattern.startsWith('!')) {
    return []
  }

  const normalizedPattern = pattern.replaceAll('\\', '/').replace(/^\.?\//, '')

  if (normalizedPattern.endsWith('/**')) {
    return findPackageDirectories(path.join(root, normalizedPattern.slice(0, -3)), true)
  }

  if (normalizedPattern.endsWith('/*')) {
    return findPackageDirectories(path.join(root, normalizedPattern.slice(0, -2)), false)
  }

  const exactDirectory = path.join(root, normalizedPattern)

  return existsSync(path.join(exactDirectory, 'package.json')) ? [exactDirectory] : []
}

function findPackageDirectories(directory: string, recursive: boolean): string[] {
  if (!existsSync(directory)) {
    return []
  }

  return readdirSync(directory)
    .flatMap(entry => {
      const entryPath = path.join(directory, entry)

      if (!statSync(entryPath).isDirectory()) {
        return []
      }

      if (existsSync(path.join(entryPath, 'package.json'))) {
        return [entryPath]
      }

      return recursive ? findPackageDirectories(entryPath, true) : []
    })
    .sort((first, second) => first.localeCompare(second))
}

function readPackageJson(filePath: string): PackageJson {
  return JSON.parse(readFileSync(filePath, 'utf8')) as PackageJson
}

function readWorkspaceManifest(root: string): WorkspaceManifest {
  const manifestPath = path.join(root, 'pnpm-workspace.yaml')

  if (!existsSync(manifestPath)) {
    return { catalog: {}, packages: [] }
  }

  const lines = readFileSync(manifestPath, 'utf8').split(/\r?\n/)

  return {
    catalog: parseYamlRecord(lines, 'catalog'),
    packages: parseYamlList(lines, 'packages')
  }
}

function parseYamlRecord(lines: string[], section: string) {
  const result: Record<string, string> = {}
  const startIndex = lines.findIndex(line => line.trim() === `${section}:`)

  if (startIndex < 0) {
    return result
  }

  const sectionIndent = getIndent(lines[startIndex])

  for (const line of lines.slice(startIndex + 1)) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue
    }

    const indent = getIndent(line)

    if (indent <= sectionIndent) {
      break
    }

    const match = line.trim().match(/^([^:]+):\s*(.+)$/)

    if (match) {
      result[match[1].trim()] = stripYamlValue(match[2])
    }
  }

  return result
}

function parseYamlList(lines: string[], section: string) {
  const result: string[] = []
  const startIndex = lines.findIndex(line => line.trim() === `${section}:`)

  if (startIndex < 0) {
    return result
  }

  const sectionIndent = getIndent(lines[startIndex])

  for (const line of lines.slice(startIndex + 1)) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue
    }

    const indent = getIndent(line)

    if (indent <= sectionIndent) {
      break
    }

    const trimmed = line.trim()

    if (trimmed.startsWith('-')) {
      result.push(stripYamlValue(trimmed.slice(1).trim()))
    }
  }

  return result
}

function getIndent(line: string) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function stripYamlValue(value: string) {
  return value.replace(/^['"]|['"]$/g, '').trim()
}

function resolveDependencyRecord(
  packages: WorkspacePackage[],
  dependencyType: 'dependencies' | 'devDependencies',
  packageVersions: Record<string, string | undefined>,
  manifest: WorkspaceManifest
) {
  const result: Record<string, string> = {}

  for (const { packageJson } of packages) {
    for (const [name, version] of Object.entries(packageJson[dependencyType] ?? {})) {
      result[name] = resolvePackageVersion(packageVersions, name, version, manifest.catalog)
    }
  }

  return result
}

function resolvePackageVersion(
  packageVersions: Record<string, string | undefined>,
  name: string,
  version: string,
  catalog: Record<string, string>
) {
  if (version.startsWith('workspace:')) {
    return packageVersions[name] ?? version.replace(/^workspace:/, '')
  }

  if (version === 'catalog:' || version === 'catalog:*') {
    return catalog[name] ?? version
  }

  if (version.startsWith('catalog:')) {
    return catalog[version.slice('catalog:'.length)] ?? catalog[name] ?? version
  }

  return version
}

function toDependencyList(dependencies: Record<string, string>) {
  return Object.entries(dependencies)
    .map(([name, version]) => ({ name, version }))
    .sort((first, second) => first.name.localeCompare(second.name))
}

function resolveRepositoryUrl(repository: PackageJson['repository']) {
  if (!repository) {
    return undefined
  }

  if (typeof repository === 'string') {
    return repository
  }

  return repository.url
}

function resolveAuthor(author: PackageJson['author']) {
  if (!author) {
    return '-'
  }

  if (typeof author === 'string') {
    return author
  }

  return [author.name, author.email].filter(Boolean).join(' ') || author.url || '-'
}

function formatBuildTime(date: Date) {
  const segments = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  ].map(segment => String(segment).padStart(2, '0'))

  return `${segments[0]}-${segments[1]}-${segments[2]} ${segments[3]}:${segments[4]}:${segments[5]}`
}
