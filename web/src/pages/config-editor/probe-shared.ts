import type { ConfigEditorValue } from '@/api/config-editor'

/**
 * 配置编辑器里被多个模块共用的类型与小工具。
 *
 * 抽出来的原因是「数据库 / 表」选择器已经独立成一个组件文件，
 * 而它和主编辑器都需要同一套 JSON Pointer 与取值逻辑。
 */

export type ConfigObject = { [key: string]: ConfigEditorValue }

export type ProbeKind = 'database' | 'storage'

/** 传给字段编辑器的上下文：用当前草稿值去测试连接 / 拉取表列表。 */
export interface ProbeContext {
  kind: ProbeKind
  modelName: string
  path: string
  type: string
  value: ConfigObject
}

export function toConfigPointer(...segments: string[]) {
  return segments.length === 0
    ? ''
    : `/${segments.map(segment => segment.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`
}

export function pointerSegments(path: string) {
  if (!path) return []
  return path
    .slice(1)
    .split('/')
    .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
}

export function displayValue(value: ConfigEditorValue | undefined) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
