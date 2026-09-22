import { http } from '@/lib/http'

export interface ConfigEditorMaskedValue {
  configured: boolean
  masked: string
}

export type ConfigEditorValue =
  | ConfigEditorMaskedValue
  | boolean
  | number
  | string
  | null
  | ConfigEditorValue[]
  | { [key: string]: ConfigEditorValue }

export interface ConfigEditorField {
  key: string
  label: string
  type: string
  description?: string
  required?: boolean
  sensitive?: boolean
  options?: string[]
  /** 选项的中文显示名，键是选项值，由后端 schema 下发 */
  option_labels?: Record<string, string>
  /** 运行时在字段缺失时使用的默认值，由后端 schema 下发 */
  default?: ConfigEditorValue
  /** 自由文本字段的下拉建议，不限制用户输入 */
  suggestions?: string[]
  /** tables / exclude_tables 支持从数据库读取表名后多选 */
  table_selector?: boolean
}

export interface ConfigEditorSchema {
  version: number
  global: ConfigEditorField[]
  model: ConfigEditorField[]
  databases: Record<string, ConfigEditorField[]>
  storages: Record<string, ConfigEditorField[]>
  notifiers: Record<string, ConfigEditorField[]>
  sections: Record<string, ConfigEditorField[]>
}

export interface ConfigEditorResponse {
  version: string
  config: Record<string, ConfigEditorValue>
  data?: Record<string, ConfigEditorValue>
  schema: ConfigEditorSchema
}

export interface ConfigEditorOperation {
  op: 'set' | 'delete'
  path: string
  value?: ConfigEditorValue
}

export interface ConfigEditorSaveResponse {
  message: string
  version: string
  config?: Record<string, ConfigEditorValue>
}

export interface ConfigProbeRequest {
  /** test：只测连接；tables：拉取表 / 集合；databases：拉取数据库 / 桶列表。 */
  action: 'test' | 'tables' | 'databases'
  kind: 'database' | 'storage'
  model?: string
  path: string
  type: string
  value?: ConfigEditorValue
}

export interface ConfigProbeResponse {
  ok: boolean
  message: string
  tables?: string[]
  databases?: string[]
  dump_tool?: string
  dump_tool_found?: boolean
  dump_tool_path?: string
  dump_tool_command?: string
}

export const configEditorApi = {
  get: (signal?: AbortSignal) =>
    http.get<ConfigEditorResponse>('/config/editor', { signal }),
  patch: (version: string, operations: ConfigEditorOperation[]) =>
    http.patch<ConfigEditorSaveResponse>('/config/editor', { operations, version }),
  probe: (request: ConfigProbeRequest) =>
    http.post<ConfigProbeResponse>('/config/probe', request),
  reload: () => http.post<{ message: string; version: string }>('/config/editor/reload'),
  validate: (version: string, operations: ConfigEditorOperation[]) =>
    http.post<ConfigEditorResponse & { valid: boolean }>(
      '/config/editor/validate',
      { operations, version }
    )
}

