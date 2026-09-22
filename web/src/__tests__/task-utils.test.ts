import { describe, expect, it } from 'vitest'

import type { BackupRun } from '@/api/gobackup'
import {
  bytesText,
  elapsedMs,
  filterTasks,
  formatElapsed,
  isRunningTask,
  modelOptionsOf,
  phaseText,
  progressAriaLabel,
  progressPercent,
  progressSummary,
  progressText,
  sortTasks,
  taskLogDownloadUrl,
  taskLogStreamUrl
} from '@/pages/tasks/task-utils'

function run(overrides: Partial<BackupRun> = {}): BackupRun {
  return {
    duration_ms: 0,
    id: 'run-1',
    model: 'venus',
    started_at: '2026-09-18T10:00:00Z',
    status: 'success',
    trigger: 'schedule',
    ...overrides
  }
}

describe('isRunningTask', () => {
  it('uses the backend running flag instead of the status string', () => {
    expect(isRunningTask(run({ running: true, status: 'running' }))).toBe(true)
    expect(isRunningTask(run({ running: false, status: 'running' }))).toBe(false)
    expect(isRunningTask(run({ status: 'success' }))).toBe(false)
  })
})

describe('elapsedMs', () => {
  const startedAt = '2026-09-18T10:00:00Z'
  const startedMs = Date.parse(startedAt)

  it('keeps the backend duration for finished tasks', () => {
    expect(elapsedMs(run({ duration_ms: 65_000 }), startedMs + 600_000)).toBe(65_000)
  })

  it('keeps ticking for running tasks', () => {
    expect(
      elapsedMs(run({ running: true, started_at: startedAt, status: 'running' }), startedMs + 12_000)
    ).toBe(12_000)
  })

  it('never returns a negative duration for clock skew', () => {
    expect(elapsedMs(run({ running: true, started_at: startedAt }), startedMs - 5_000)).toBe(0)
  })

  it('falls back to the backend duration when the start time is unusable', () => {
    expect(elapsedMs(run({ running: true, started_at: 'not-a-date', duration_ms: 3_000 }), startedMs)).toBe(
      3_000
    )
    expect(elapsedMs(run({ running: true, started_at: 'not-a-date' }), startedMs)).toBe(0)
  })
})

describe('formatElapsed', () => {
  it('formats seconds, minutes and hours in Chinese', () => {
    expect(formatElapsed(0)).toBe('0 秒')
    expect(formatElapsed(-1)).toBe('0 秒')
    expect(formatElapsed(400)).toBe('不到 1 秒')
    expect(formatElapsed(12_400)).toBe('12 秒')
    expect(formatElapsed(65_000)).toBe('1 分 05 秒')
    expect(formatElapsed(3_600_000 + 2 * 60_000)).toBe('1 小时 02 分')
  })
})

describe('progressPercent', () => {
  it('returns undefined while the total is unknown', () => {
    expect(progressPercent(undefined)).toBeUndefined()
    expect(
      progressPercent({ indeterminate: true, percent: 42, phase_percent: 42 })
    ).toBeUndefined()
  })

  it('rounds and clamps the overall percent', () => {
    expect(progressPercent({ percent: 42.6, phase_percent: 10 })).toBe(43)
    expect(progressPercent({ percent: 130, phase_percent: 10 })).toBe(100)
    expect(progressPercent({ percent: -5, phase_percent: 10 })).toBe(0)
    expect(progressPercent({ percent: Number.NaN, phase_percent: 10 })).toBe(0)
  })

  it('labels the progress text, aria text and summary consistently', () => {
    expect(progressText({ indeterminate: true, percent: 0, phase_percent: 0 })).toBe('进行中')
    expect(progressText({ percent: 42.4, phase_percent: 10 })).toBe('42%')
    expect(progressAriaLabel({ percent: 42.4, phase_percent: 10 }, 'venus')).toBe('venus 进度 42%')
    expect(progressAriaLabel({ indeterminate: true, percent: 0, phase_percent: 0 })).toBe('进行中')
  })

  it('only shows progress for running tasks', () => {
    expect(
      progressSummary(
        run({
          progress: { percent: 30, phase: '导出数据库', phase_percent: 30 },
          running: true,
          status: 'running'
        })
      )
    ).toBe('30% · 导出数据库')
    expect(progressSummary(run({ progress: { percent: 30, phase_percent: 30 } }))).toBe('-')
  })
})

describe('bytesText', () => {
  it('returns an empty string when nothing was transferred', () => {
    expect(bytesText(undefined)).toBe('')
    expect(bytesText({ percent: 0, phase_percent: 0 })).toBe('')
    expect(bytesText({ bytes_done: 0, bytes_total: 0, percent: 0, phase_percent: 0 })).toBe('')
  })

  it('prefers the done / total form', () => {
    expect(
      bytesText({
        bytes_done: 1024,
        bytes_total: 5 * 1024 * 1024,
        percent: 10,
        phase_percent: 10
      })
    ).toBe('1.0 KB / 5.0 MB')
  })

  it('falls back to the processed bytes only', () => {
    expect(bytesText({ bytes_done: 2048, percent: 10, phase_percent: 10 })).toBe('2.0 KB')
  })
})

describe('phaseText', () => {
  it('joins phase and detail and tolerates blanks', () => {
    expect(
      phaseText({ detail: '导出 mysql/venus · 1.2 GB', percent: 10, phase: '导出数据库', phase_percent: 10 })
    ).toBe('导出数据库 · 导出 mysql/venus · 1.2 GB')
    expect(phaseText({ detail: '   ', percent: 10, phase_percent: 10 })).toBe('')
    expect(phaseText(undefined)).toBe('')
  })
})

describe('sortTasks', () => {
  it('puts running tasks first, then sorts by start time descending', () => {
    const finishedOld = run({ id: 'a', started_at: '2026-09-18T09:00:00Z' })
    const finishedNew = run({ id: 'b', started_at: '2026-09-18T11:00:00Z' })
    const runningOld = run({ id: 'c', running: true, started_at: '2026-09-18T08:00:00Z' })
    const runningNew = run({ id: 'd', running: true, started_at: '2026-09-18T12:00:00Z' })

    const sorted = sortTasks([finishedOld, runningOld, finishedNew, runningNew])

    expect(sorted.map(item => item.id)).toEqual(['d', 'c', 'b', 'a'])
    // 不修改入参数组。
    expect(sorted).not.toBe([finishedOld, runningOld, finishedNew, runningNew])
  })
})

describe('filterTasks / modelOptionsOf', () => {
  const tasks = [
    run({ id: 'a', model: 'venus', running: true, started_at: '2026-09-18T10:00:00Z' }),
    run({ id: 'b', model: 'mysql', started_at: '2026-09-18T11:00:00Z' }),
    run({ id: 'c', model: 'venus', started_at: '2026-09-18T09:00:00Z' })
  ]

  it('filters by model and running state', () => {
    expect(filterTasks(tasks, '', false).map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(filterTasks(tasks, 'venus', false).map(item => item.id)).toEqual(['a', 'c'])
    expect(filterTasks(tasks, '', true).map(item => item.id)).toEqual(['a'])
    expect(filterTasks(tasks, 'mysql', true)).toEqual([])
  })

  it('lists unique model names sorted alphabetically', () => {
    expect(modelOptionsOf(tasks)).toEqual(['mysql', 'venus'])
    expect(modelOptionsOf([])).toEqual([])
  })
})

describe('task log urls', () => {
  it('builds the stream url with a tail window and encodes the run id', () => {
    expect(taskLogStreamUrl('run-1')).toBe('/api/runs/run-1/log/stream?tail=200')
    expect(taskLogStreamUrl('run/2', 50)).toBe('/api/runs/run%2F2/log/stream?tail=50')
  })

  it('builds the download url', () => {
    expect(taskLogDownloadUrl('run-1')).toBe('/api/runs/run-1/log?download=1')
  })
})
