import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BackupTaskList } from '@/api/gobackup'

/**
 * 任务中心页面渲染测试。
 *
 * jsdom 没有布局，`LazyLog`(virtua) 也不会渲染任何日志行，所以这里只断言
 * 文案、进度、计数器和表格列，不碰日志内容。数据层按项目约定整体打桩。
 */

const tasksResponse: BackupTaskList = {
  running: 1,
  tasks: [
    {
      duration_ms: 0,
      id: 'run-running',
      model: 'venus',
      progress: {
        bytes_done: 1024,
        bytes_total: 5 * 1024 * 1024,
        detail: '导出 mysql/venus · 1.2 GB',
        percent: 42,
        phase: '导出数据库',
        phase_percent: 42
      },
      running: true,
      started_at: '2026-09-18T10:00:00Z',
      status: 'running',
      trigger: 'schedule'
    },
    {
      archive_name: 'venus-20260918.tar.gz',
      archive_size: 1024,
      duration_ms: 12_000,
      finished_at: '2026-09-18T10:00:12Z',
      id: 'run-finished',
      model: 'mysql',
      progress: { percent: 100, phase: '完成', phase_percent: 100 },
      running: false,
      started_at: '2026-09-18T09:00:00Z',
      status: 'success',
      trigger: 'api'
    }
  ],
  total: 2
}

vi.mock('@/api/backup-queries', () => ({
  backupQueries: {
    tasks: () => ({
      queryFn: () => Promise.resolve(tasksResponse),
      queryKey: ['gobackup', 'tasks', true]
    })
  }
}))

vi.mock('@/api/gobackup', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/gobackup')>()

  return {
    ...actual,
    gobackupApi: {
      ...actual.gobackupApi,
      deleteRun: vi.fn(),
      tasks: vi.fn()
    }
  }
})

// 任务日志走流式接口，jsdom 里不发真实请求。
vi.mock('@/api/stream', () => ({
  authorizedFetch: vi.fn(() => new Promise(() => {})),
  buildStreamUrl: (path: string, params: Record<string, string | number | undefined> = {}) =>
    `/api/${path}?${new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    ).toString()}`
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchInterval: false, retry: false, staleTime: Infinity }
    }
  })
}

// 页面依赖整棵 Semi UI 组件树（Table/Modal/Progress），首次 import 很慢。
// 放到模块顶层，让这份开销记在文件加载上，而不是算进第一个用例的超时。
const { default: TasksPage } = await import('@/pages/tasks-page')

async function renderTasksPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TasksPage />
    </QueryClientProvider>
  )
}

describe('任务中心页面', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the page header, live section and task table', async () => {
    await renderTasksPage()

    expect(await screen.findByRole('heading', { name: '任务中心' })).toBeInTheDocument()
    expect(screen.getByText('进行中任务')).toBeInTheDocument()
    expect(screen.getByText('任务列表')).toBeInTheDocument()
    expect(await screen.findByText('venus-20260918.tar.gz')).toBeInTheDocument()

    // Semi 的表格根节点带 semi-table 类，jsdom 下不一定暴露 role="table"。
    const table = document.querySelector('table, .semi-table')
    expect(table).not.toBeNull()

    for (const title of ['开始时间', '模型', '触发方式', '状态/结果', '进度', '耗时', '归档文件', '操作']) {
      expect(within(table as HTMLElement).getByText(title)).toBeInTheDocument()
    }
  })

  it('renders live progress, byte counter and elapsed time for running tasks', async () => {
    await renderTasksPage()

    // 进度条按整体 percent 展示，并且 aria 文案带上模型名。
    const progressBar = await screen.findByLabelText('venus 进度 42%')

    expect(progressBar).toBeInTheDocument()
    expect(screen.getAllByText('42%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('导出数据库 · 导出 mysql/venus · 1.2 GB').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1.0 KB / 5.0 MB').length).toBeGreaterThan(0)
    // 触发方式会同时出现在实时卡片和表格行里。
    expect(screen.getAllByText('计划任务').length).toBeGreaterThan(0)
    expect(screen.getByText(/已运行/)).toBeInTheDocument()
    // 卡片与表格都会出现「进行中」标签。
    expect(screen.getAllByText('进行中').length).toBeGreaterThan(0)
  })

  it('renders the uncertain progress bar when the total is unknown', async () => {
    tasksResponse.tasks[0].progress = {
      bytes_done: 2048,
      indeterminate: true,
      percent: 0,
      phase: '打包归档',
      phase_percent: 0
    }

    try {
      await renderTasksPage()

      expect(await screen.findByLabelText('venus 进行中')).toBeInTheDocument()
      expect(screen.getAllByText('打包归档').length).toBeGreaterThan(0)
      expect(screen.getAllByText('2.0 KB').length).toBeGreaterThan(0)
    } finally {
      tasksResponse.tasks[0].progress = {
        bytes_done: 1024,
        bytes_total: 5 * 1024 * 1024,
        detail: '导出 mysql/venus · 1.2 GB',
        percent: 42,
        phase: '导出数据库',
        phase_percent: 42
      }
    }
  })

  it('shows the empty hint when nothing is running', async () => {
    tasksResponse.tasks[0].running = false
    tasksResponse.running = 0

    try {
      await renderTasksPage()

      expect(await screen.findByText(/当前没有进行中的任务/)).toBeInTheDocument()
    } finally {
      tasksResponse.tasks[0].running = true
      tasksResponse.running = 1
    }
  })
})
