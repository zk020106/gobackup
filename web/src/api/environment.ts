import { http } from '@/lib/http'

export interface HostInfo {
  hostname: string
  os: string
  platform: string
  distribution: string
  arch: string
  cpu_cores: number
  go_version: string
  preferred_pm: string
  available_pms: string[]
}

export interface RuntimeInfo {
  version: string
  pid: number
  start_time: string
  uptime_seconds: number
  work_dir: string
  temp_dir?: string
  config_file: string
  state_dir: string
  memory_alloc_mb: number
  memory_total_mb: number
  memory_used_mb: number
  memory_percent: number
  disk_path: string
  disk_total_gb: number
  disk_free_gb: number
  disk_used_gb: number
  disk_percent: number
}

export interface ToolStatus {
  name: string
  category: 'database' | 'archive' | 'security' | 'network'
  label: string
  database_type?: string
  installed: boolean
  path: string
  version: string
  description: string
  install_commands: Record<string, string>
  default_command: string
}

export interface ToolSummary {
  total_database_tools: number
  ready_database_tools: number
  total_system_tools: number
  ready_system_tools: number
}

export interface EnvironmentResponse {
  host: HostInfo
  runtime: RuntimeInfo
  tools: ToolStatus[]
  summary: ToolSummary
}

export const environmentApi = {
  get: (signal?: AbortSignal) => http.get<EnvironmentResponse>('/system/environment', { signal })
}
