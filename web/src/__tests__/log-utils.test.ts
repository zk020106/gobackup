import { describe, expect, it } from 'vitest'

import {
  detectLogLevel,
  filterLogLines,
  formatBytes,
  formatDuration,
  splitLogChunk,
  statusLabel,
  stripAnsi,
  triggerLabel
} from '@/pages/logs/log-utils'

describe('log level detection', () => {
  it('classifies error, warn and debug lines including ANSI colors', () => {
    expect(detectLogLevel('2026/09/18 10:00:00 [Model: venus] Backup failed')).toBe('error')
    expect(detectLogLevel('\u001b[31m[error] mysqldump exited with code 2\u001b[0m')).toBe('error')
    expect(detectLogLevel('[warn] retrying upload')).toBe('warn')
    expect(detectLogLevel('[debug] command: mysqldump ...')).toBe('debug')
    expect(detectLogLevel('[Model: venus] Dump succeeded')).toBe('info')
  })

  it('classifies plain info lines and heartbeat blanks as info', () => {
    expect(
      detectLogLevel('2026/09/18 10:00:00 [Model: venus] Backup started (trigger: schedule)')
    ).toBe('info')
    expect(detectLogLevel('')).toBe('info')
    expect(detectLogLevel('   ')).toBe('info')
  })

  it('classifies GoBackup numbered errors as errors', () => {
    expect(detectLogLevel('Error #01: connection refused')).toBe('error')
    expect(detectLogLevel('[venus] Error #12: mysqldump: command not found')).toBe('error')
  })

  it('classifies GIN access log status codes', () => {
    expect(
      detectLogLevel('[GIN] 2026/09/18 - 10:00:00 | 500 | 1.234ms | 127.0.0.1 | GET /api/log')
    ).toBe('error')
    expect(
      detectLogLevel('[GIN] 2026/09/18 - 10:00:00 | 404 | 12µs | 127.0.0.1 | GET /api/nope')
    ).toBe('error')
    expect(
      detectLogLevel('[GIN] 2026/09/18 - 10:00:00 | 302 | 12µs | 127.0.0.1 | GET /api/download')
    ).toBe('warn')
    expect(detectLogLevel('[GIN] 2026/09/18 - 10:00:00 | 200 | 12µs | 127.0.0.1 | GET /api/log')).toBe(
      'info'
    )
  })

  it('ignores GIN latency fields that look like status codes', () => {
    // “| 20 |” 之类的字段不是三位数，不能误判成 4xx/5xx。
    expect(detectLogLevel('[GIN] 2026/09/18 | 200 | 500µs | 127.0.0.1 | GET /api/log')).toBe('info')
  })

  it('strips ANSI sequences', () => {
    expect(stripAnsi('\u001b[32mok\u001b[0m')).toBe('ok')
    expect(detectLogLevel('\u001b[33m[GIN] 2026/09/18 | 500 | 1ms\u001b[0m')).toBe('error')
  })
})

describe('splitLogChunk', () => {
  it('keeps a partial trailing line as the remainder', () => {
    expect(splitLogChunk('line one\nline t')).toEqual({
      lines: ['line one'],
      remainder: 'line t'
    })
  })

  it('returns no lines and a full remainder for a chunk without newline', () => {
    expect(splitLogChunk('partial')).toEqual({ lines: [], remainder: 'partial' })
  })

  it('drops blank and whitespace-only heartbeat lines', () => {
    expect(splitLogChunk('\n')).toEqual({ lines: [], remainder: '' })
    expect(splitLogChunk('a\n\n   \n\t\nb\n')).toEqual({ lines: ['a', 'b'], remainder: '' })
  })

  it('normalizes CRLF and trailing carriage returns', () => {
    expect(splitLogChunk('a\r\nb\r\n')).toEqual({ lines: ['a', 'b'], remainder: '' })
    // 半行不 trim：残缺的 \r 进度输出要等这一行收完再一起处理。
    expect(splitLogChunk('\rProgress 50%\r')).toEqual({
      lines: [],
      remainder: '\rProgress 50%\r'
    })
    // 行尾的 \r（Windows 日志 / 进度回退）必须去掉，避免光标回到行首。
    expect(splitLogChunk('Progress 50%\r\nnext\r\n')).toEqual({
      lines: ['Progress 50%', 'next'],
      remainder: ''
    })
  })

  it('does not drop the newline that terminates the last complete line', () => {
    // 空行心跳必须被完整吃掉，否则会作为残余拼到下一行前面。
    expect(splitLogChunk('\r\nnext\n')).toEqual({ lines: ['next'], remainder: '' })
  })

  it('handles multi-byte payloads without touching their content', () => {
    expect(splitLogChunk('[Model: venus] 备份完成\n')).toEqual({
      lines: ['[Model: venus] 备份完成'],
      remainder: ''
    })
  })
})

describe('filterLogLines', () => {
  const lines = [
    '2026/09/18 [Model: venus] start backup',
    '[error] mysqldump failed',
    '[warn] disk almost full',
    '[debug] args: --single-transaction'
  ]

  it('filters by level', () => {
    expect(filterLogLines(lines, 'error', '')).toEqual(['[error] mysqldump failed'])
    expect(filterLogLines(lines, 'warn', '')).toEqual(['[warn] disk almost full'])
    expect(filterLogLines(lines, 'all', '')).toHaveLength(4)
  })

  it('filters by keyword ignoring case and colors', () => {
    expect(filterLogLines(lines, 'all', 'VENUS')).toHaveLength(1)
    expect(filterLogLines(lines, 'info', 'backup')).toEqual([
      '2026/09/18 [Model: venus] start backup'
    ])
  })

  it('filters GIN failures by the error level', () => {
    const gin = [
      '[GIN] 2026/09/18 | 200 | 1ms | 127.0.0.1 | GET /api/log',
      '[GIN] 2026/09/18 | 500 | 3ms | 127.0.0.1 | GET /api/runs',
      'Error #01: connection refused'
    ]

    expect(filterLogLines(gin, 'error', '')).toHaveLength(2)
    expect(filterLogLines(gin, 'info', '')).toHaveLength(1)
    expect(filterLogLines(gin, 'all', 'runs')).toHaveLength(1)
  })
})

describe('formatting helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('-')
    expect(formatDuration(850)).toBe('850 ms')
    expect(formatDuration(1500)).toBe('1.5 s')
    expect(formatDuration(65_000)).toBe('1 分 5 秒')
  })

  it('formats byte sizes', () => {
    expect(formatBytes(undefined)).toBe('-')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('labels triggers and statuses in Chinese', () => {
    expect(triggerLabel('schedule')).toBe('计划任务')
    expect(triggerLabel('api')).toBe('网页触发')
    expect(statusLabel('success')).toBe('成功')
    expect(statusLabel('failure')).toBe('失败')
  })
})
