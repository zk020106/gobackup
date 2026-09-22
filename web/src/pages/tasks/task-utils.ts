import { buildBackupUrl, type BackupRun, type TaskProgress } from '@/api/gobackup'
import { formatBytes } from '@/pages/logs/log-utils'

/**
 * 任务中心的纯展示逻辑。
 *
 * 这里只放不依赖 DOM / React 的计算，方便用 vitest 直接覆盖：
 * 耗时文本、进度百分比、字节文案、排序与过滤规则。
 */

/** 1 秒的轮询节奏，用于本页所有「本地刷新」的计时器。 */
export const second = 1000

/** 判定任务是否仍在进行中：后端返回的 `running` 是布尔真值来源。 */
export function isRunningTask(run: BackupRun) {
  return run.running === true
}

/**
 * 任务耗时：进行中的任务按「现在 - 开始时间」实时计算，已结束的用后端给出的毫秒数。
 *
 * @param run - 一条备份任务。
 * @param now - 当前时间戳，默认取系统时间；测试时可注入固定值。
 * @returns 毫秒耗时，负数或非法值返回 0。
 */
export function elapsedMs(run: BackupRun, now: number = Date.now()) {
  const finished = Number(run.duration_ms)

  if (!isRunningTask(run) && Number.isFinite(finished)) {
    return finished > 0 ? finished : 0
  }

  const started = new Date(run.started_at).getTime()
  if (!Number.isFinite(started)) {
    return Number.isFinite(finished) && finished > 0 ? finished : 0
  }

  return Math.max(0, now - started)
}

/**
 * 进行中任务的耗时文案，精确到秒并保持单位不跳动，例如「12 秒」「1 分 05 秒」「2 小时 03 分」。
 *
 * @param milliseconds - 毫秒耗时。
 * @returns 中文耗时文本。
 */
export function formatElapsed(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0 秒'

  const seconds = Math.floor(milliseconds / 1000)
  if (seconds < 1) return '不到 1 秒'
  if (seconds < 60) return `${seconds} 秒`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分 ${String(seconds % 60).padStart(2, '0')} 秒`

  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${String(minutes % 60).padStart(2, '0')} 分`
}

/**
 * 进度条要展示的百分比。
 *
 * - 没有进度信息时返回 0；
 * - `indeterminate`（总量未知）时返回 undefined，交给 Semi 渲染不确定动画，
 *   避免把「阶段百分比」冒充整体进度；
 * - 其余情况取整体 `percent` 四舍五入并夹在 0-100。
 */
export function progressPercent(progress?: TaskProgress): number | undefined {
  if (!progress || progress.indeterminate) return undefined

  const value = Number(progress.percent)
  if (!Number.isFinite(value)) return 0

  return Math.min(100, Math.max(0, Math.round(value)))
}

/** 进度条右侧文案：不确定进度显示「进行中」，否则显示整体百分比。 */
export function progressText(progress?: TaskProgress) {
  const percent = progressPercent(progress)

  return percent === undefined ? '进行中' : `${percent}%`
}

/** 进度条的 aria 文本，供读屏与测试断言使用。 */
export function progressAriaLabel(progress?: TaskProgress, model = '') {
  const prefix = model ? `${model} ` : ''

  return progressPercent(progress) === undefined
    ? `${prefix}进行中`
    : `${prefix}进度 ${progressPercent(progress)}%`
}

/**
 * 字节文案。
 *
 * - 有总量时显示 `已完成 / 总量`；
 * - 只有已处理字节时显示已处理量；
 * - 都没有则返回空串（调用方不渲染该行）。
 */
export function bytesText(progress?: TaskProgress) {
  const done = progress?.bytes_done ?? 0
  const total = progress?.bytes_total ?? 0

  if (total > 0) {
    return `${formatBytes(done)} / ${formatBytes(total)}`
  }
  if (done > 0) {
    return formatBytes(done)
  }

  return ''
}

/** 阶段说明。`detail` 已经是后端拼好的可读文案（例如「导出 mysql/venus · 1.2 GB」）。 */
export function phaseText(progress?: TaskProgress) {
  const parts = [progress?.phase, progress?.detail].filter(
    (part): part is string => Boolean(part && part.trim())
  )

  return parts.join(' · ')
}

/** 表格「进度」列：进行中显示「百分比 · 阶段」，已结束统一为「-」。 */
export function progressSummary(run: BackupRun) {
  if (!isRunningTask(run)) return '-'

  const phase = phaseText(run.progress)
  const percent = progressText(run.progress)

  return phase ? `${percent} · ${phase}` : percent
}

/**
 * 任务列表的展示顺序：进行中优先，其次按开始时间倒序。
 *
 * @param runs - 后端返回的任务数组（后端已排过一次，这里保证前端二次过滤后顺序稳定）。
 * @returns 新数组，不修改入参。
 */
export function sortTasks(runs: BackupRun[]) {
  return [...runs].sort((left, right) => {
    const runningDelta = Number(isRunningTask(right)) - Number(isRunningTask(left))
    if (runningDelta !== 0) return runningDelta

    return new Date(right.started_at).getTime() - new Date(left.started_at).getTime()
  })
}

/** 从任务列表里取出去重后的模型名，用于筛选下拉。 */
export function modelOptionsOf(runs: BackupRun[]) {
  return Array.from(new Set(runs.map(run => run.model))).sort()
}

/**
 * 按模型 / 只看进行中筛选任务。
 *
 * @param runs - 任务数组。
 * @param model - 模型名，空串表示全部。
 * @param onlyRunning - 只保留进行中的任务。
 */
export function filterTasks(runs: BackupRun[], model: string, onlyRunning: boolean) {
  return runs.filter(run => {
    if (model && run.model !== model) return false
    if (onlyRunning && !isRunningTask(run)) return false
    return true
  })
}

/**
 * 某个任务的日志流地址，`tail` 用于回放最后若干行。
 *
 * 路径里的任务 id 先做 URL 编码，再交给 `authorizedFetch` 带上 Bearer 头请求。
 */
export function taskLogStreamUrl(id: string, tail = 200) {
  return buildBackupUrl(`runs/${encodeURIComponent(id)}/log/stream`, { tail: String(tail) })
}

/** 某个任务完整日志的下载地址。 */
export function taskLogDownloadUrl(id: string) {
  return buildBackupUrl(`runs/${encodeURIComponent(id)}/log`, { download: '1' })
}
