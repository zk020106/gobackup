// 类型：ProjectDependencyRecord。描述关于页展示的单个依赖版本。
export interface ProjectDependencyRecord {
  name: string
  version: string
}

// 类型：ProjectDependencyGroup。描述关于页依赖分组。
export interface ProjectDependencyGroup {
  dependencies: ProjectDependencyRecord[]
  description: string
  title: string
  type: 'dependencies' | 'devDependencies'
}

// 类型：ProjectMetaItem。描述关于页基础信息项。
export interface ProjectMetaItem {
  href?: string
  label: string
  value: string
}

// 类型：ProjectInfo。描述构建期解析出的项目基础信息和依赖信息。
export interface ProjectInfo {
  dependencyGroups: ProjectDependencyGroup[]
  description: string
  meta: ProjectMetaItem[]
  name: string
  packageManager: string
  version: string
}
