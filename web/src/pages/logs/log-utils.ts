import { authorizedFetch } from '@/api/stream'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'
export type LogLevelFilter = 'all' | LogLevel

// eslint-disable-next-line no-control-regex
const ansiPattern = /\u001b\[[0-9;]*[a-zA-Z]/g

/** 去掉 ANSI 颜色控制符，便于关键词匹配与等级判断。 */
export function stripAnsi(line: string) {
  return line.replace(ansiPattern, '')
}

// 方括号前缀 / 独立单词两类写法都要覆盖：日志里既有 [error] 也有 “... failed” 这种句子。
const errorPattern = /\[(error|fatal|panic)\]|\b(error|fatal|panic|failed|failure)\b/i
const warnPattern = /\[warn(ing)?\]|\bwarn(ing)?\b/i
const debugPattern = /\[debug\]|\bdebug\b/i
// GoBackup 自己包装过的错误会写成 “Error #01: ...”。
const numberedErrorPattern = /error\s*#\s*\d+/i
// Gin 的访问日志形如 “[GIN] 2026/09/18 - 10:00:00 | 500 | 1.2ms | 127.0.0.1 | GET /api/log”，
// 管道符字段的排列随 Gin 版本变化，所以只按值扫描 3xx/4xx/5xx，不绑定字段位置。
const ginMarkerPattern = /\[GIN\]/i

const statusCodes: Record<number, LogLevel> = {
  301: 'warn',
  302: 'warn',
  303: 'warn',
  304: 'warn',
  307: 'warn',
  308: 'warn',
  400: 'error',
  401: 'error',
  403: 'error',
  404: 'error',
  405: 'error',
  408: 'error',
  409: 'error',
  410: 'error',
  413: 'error',
  415: 'error',
  422: 'error',
  429: 'error',
  500: 'error',
  501: 'error',
  502: 'error',
  503: 'error',
  504: 'error',
  505: 'error'
}

/** 从形如 “| 500 |” 的字段里取 HTTP 状态码，取不到返回 undefined。 */
function readHttpStatus(line: string) {
  const matched = /\|\s*(\d{3})\s*\|/.exec(line)

  if (!matched) {
    return undefined
  }

  const status = Number(matched[1])
  return status >= 300 && status <= 599 ? status : undefined
}

/**
 * 根据日志内容推断等级，用于运行日志页的等级筛选与高亮。
 *
 * 空白行（心跳）与纯空白行一律按 info 处理，它们不会被渲染。
 */
export function detectLogLevel(line: string): LogLevel {
  const text = stripAnsi(line)

  if (ginMarkerPattern.test(text)) {
    const status = readHttpStatus(text)
    if (status !== undefined && statusCodes[status]) {
      return statusCodes[status]
    }
  }

  if (errorPattern.test(text) || numberedErrorPattern.test(text)) return 'error'
  if (warnPattern.test(text)) return 'warn'
  if (debugPattern.test(text)) return 'debug'
  return 'info'
}

/** 等级对应的日志文字颜色，与运行日志页的深色终端底色搭配。 */
export function logLevelClassName(level: LogLevel) {
  switch (level) {
    case 'error':
      return 'font-medium text-red-400'
    case 'warn':
      return 'text-amber-300'
    case 'debug':
      return 'text-slate-400'
    default:
      return undefined
  }
}

/**
 * 把一段流式日志切片拆成完整行 + 未结束的残余。
 *
 * 后端按字节流下发，切片可能从任意位置断开，所以残余必须留到下一个切片；
 * 空行 / 纯空白行是服务端的心跳（每 15 秒一个 "\n"），直接丢弃；
 * 行尾的 `\r` 来自 Windows 日志或残留的进度输出，一并去掉避免光标回到行首。
 */
export function splitLogChunk(chunk: string): { lines: string[]; remainder: string } {
  const parts = chunk.split('\n')
  // 最后一个 \n 之后的内容还没结束，留给下一个切片继续拼接。
  const remainder = parts.pop() ?? ''
  const lines: string[] = []

  for (const part of parts) {
    const line = part.replace(/\r+$/, '')
    if (line.trim() === '') {
      continue
    }
    lines.push(line)
  }

  return { lines, remainder }
}

/** 按等级和关键词过滤日志行，等级与关键词同时满足才会保留。 */
export function filterLogLines(lines: string[], level: LogLevelFilter, keyword: string) {
  const needle = keyword.trim().toLowerCase()

  return lines.filter(line => {
    if (level !== 'all' && detectLogLevel(line) !== level) {
      return false
    }
    if (needle && !stripAnsi(line).toLowerCase().includes(needle)) {
      return false
    }
    return true
  })
}

/** 触发方式的中文名。 */
export function triggerLabel(trigger: string) {
  switch (trigger) {
    case 'schedule':
      return '计划任务'
    case 'api':
      return '网页触发'
    case 'cli':
      return '命令行'
    case 'manual':
      return '手动'
    default:
      return trigger
  }
}

/** 备份状态的中文名。 */
export function statusLabel(status: string) {
  switch (status) {
    case 'success':
      return '成功'
    case 'failure':
      return '失败'
    case 'running':
      return '进行中'
    default:
      return status
  }
}

/** 毫秒转成易读的耗时。 */
export function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return '-'
  }
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`
  }

  const seconds = milliseconds / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  }

  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) {
    return `${minutes} 分 ${rest} 秒`
  }

  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

/** 字节数转成易读大小。 */
export function formatBytes(bytes: number | undefined) {
  if (!bytes || bytes <= 0) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** 格式化后端返回的 RFC3339 时间。 */
export function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

/**
 * 下载一个需要登录态的文本/二进制接口。
 *
 * 后端接口走同一套鉴权，所以统一用 authorizedFetch 带上 Bearer token 与凭据，
 * 再触发浏览器保存，避免 <a download> 在 Basic Auth 下弹窗或下载失败。
 */
export async function downloadRemoteFile(url: string, filename: string) {
  const response = await authorizedFetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
