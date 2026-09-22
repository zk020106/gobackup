import { runtimeEnv } from '@/config/env'
import { http } from '@/lib/http'

export interface BackupSchedule {
  enabled?: boolean
  [key: string]: unknown
}

export interface BackupProviderInfo {
  name: string
  type: string
}

export interface BackupModel {
  description?: string
  schedule?: BackupSchedule
  schedule_info?: string
  /** 该模型包含的数据库配置。 */
  databases?: BackupProviderInfo[]
  /** 该模型当前是否有进行中的任务。 */
  running?: boolean
  /** 当前存在冲突时的提示文案（例如同一数据库环境已有任务）。 */
  conflict?: string
}

export interface BackupFile {
  filename: string
  last_modified?: string
  size?: number
}

export interface RunProviderInfo {
  name: string
  type: string
}

export interface ServiceStatus {
  message: string
  version: string
}

export type BackupRunStatus = 'running' | 'success' | 'failure'

/** 一次备份任务的实时进度（对应后端 runlog.Progress）。 */
export interface TaskProgress {
  /** 当前阶段名，例如「导出数据库」。 */
  phase?: string
  /** 当前阶段说明，例如「导出 mysql/venus · 1.2 GB」。 */
  detail?: string
  /** 整体进度 0-100。 */
  percent: number
  /** 当前阶段进度 0-100。 */
  phase_percent: number
  /** 总量未知时为 true，界面应展示为不确定进度。 */
  indeterminate?: boolean
  bytes_done?: number
  bytes_total?: number
  updated_at?: string
}

export interface BackupRun {
  id: string
  model: string
  description?: string
  trigger: string
  status: BackupRunStatus
  started_at: string
  finished_at?: string
  duration_ms: number
  error?: string
  databases?: RunProviderInfo[]
  storages?: RunProviderInfo[]
  archive_name?: string
  archive_size?: number
  log_size?: number
  /** 是否仍在进行中。 */
  running?: boolean
  /** 实时进度，历史记录保留最后一次状态。 */
  progress?: TaskProgress
}

export interface BackupTaskList {
  tasks: BackupRun[]
  running: number
  total: number
}

interface ConfigResponse {
  models?: Record<string, BackupModel>
  running?: number
}

interface FileListResponse {
  files?: BackupFile[]
}

interface PerformResponse {
  message?: string
}

interface RunListResponse {
  runs?: BackupRun[]
  total?: number
}

export const gobackupApi = {
  files: (model: string, parent: string, signal?: AbortSignal) =>
    http
      .get<FileListResponse>('/list', {
        params: { model, parent },
        signal
      })
      .then(response => response.files ?? []),
  models: (signal?: AbortSignal) =>
    http
      .get<ConfigResponse>('/config', { signal })
      .then(response => response.models ?? {}),
  perform: (model: string) => http.post<PerformResponse>('/perform', { model }),
  runs: (params: { limit?: number; model?: string } = {}, signal?: AbortSignal) =>
    http
      .get<RunListResponse>('/runs', {
        params: { limit: params.limit ?? 100, model: params.model || undefined },
        signal
      })
      .then(response => response.runs ?? []),
  /** 任务中心：进行中的任务（含实时进度）+ 最近的备份记录。 */
  tasks: (
    params: { includeFinished?: boolean; limit?: number; model?: string } = {},
    signal?: AbortSignal
  ) =>
    http
      .get<BackupTaskList>('/tasks', {
        params: {
          include_finished: params.includeFinished === false ? '0' : '1',
          limit: params.limit ?? 50,
          model: params.model || undefined
        },
        signal
      })
      .then(response => ({
        running: response.running ?? 0,
        tasks: response.tasks ?? [],
        total: response.total ?? 0
      })),
  status: (signal?: AbortSignal) => http.get<ServiceStatus>('/status', { signal }),
  runLog: (id: string, signal?: AbortSignal) =>
    http.get<string>(`/runs/${encodeURIComponent(id)}/log`, {
      responseType: 'text',
      signal,
      transformResponse: value => value
    }),
  deleteRun: (id: string) => http.delete<{ message?: string }>(`/runs/${encodeURIComponent(id)}`),
  /**
   * 为浏览器原生下载签发一次性票据。
   *
   * 归档文件可能有几百 MB，不能先用 fetch 读进内存再存盘；而 <a href> 又带不上
   * Authorization 头，所以先换一张短期票据，再让浏览器带着 ?ticket= 去下载。
   */
  downloadTicket: (model: string, path: string) =>
    http
      .get<{ ticket?: string }>('/download/ticket', { params: { model, path } })
      .then(response => response.ticket ?? '')
}

/** Build a browser URL for a GoBackup endpoint, including query parameters. */
export function buildBackupUrl(
  path: string,
  params: Record<string, string | undefined> = {}
) {
  const configuredBase = runtimeEnv.apiBaseUrl.replace(/\/$/, '') || '/api'
  const endpoint = path.startsWith('/') ? path : `/${path}`
  const isAbsolute = /^https?:\/\//i.test(configuredBase)
  const base = isAbsolute
    ? configuredBase
    : `${configuredBase.startsWith('/') ? configuredBase : `/${configuredBase}`}`
  const url = new URL(`${base}${endpoint}`, window.location.origin)

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, value)
    }
  })

  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`
}
