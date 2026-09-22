import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BackupModel, BackupTaskList } from '@/api/gobackup'

const modelsResponse: Record<string, BackupModel> = {
  venus: {
    description: '生产主库备份',
    databases: [{ name: 'venus_db', type: 'mysql' }],
    schedule: { enabled: true },
    schedule_info: '每天 02:00'
  },
  redis_cache: {
    description: '缓存数据备份',
    databases: [{ name: 'cache', type: 'redis' }],
    schedule: { enabled: false }
  }
}

const tasksResponse: BackupTaskList = {
  running: 0,
  tasks: [
    {
      archive_name: 'venus-20260920.tar.gz',
      archive_size: 1024 * 1024 * 100, // 100 MB
      duration_ms: 15_000,
      finished_at: '2026-09-20T10:00:15Z',
      id: 'run-venus-1',
      model: 'venus',
      running: false,
      started_at: '2026-09-20T10:00:00Z',
      status: 'success',
      trigger: 'schedule'
    }
  ],
  total: 1
}

vi.mock('@/api/backup-queries', () => ({
  backupQueries: {
    models: () => ({
      queryFn: () => Promise.resolve(modelsResponse),
      queryKey: ['gobackup', 'models']
    }),
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
      perform: vi.fn().mockResolvedValue({ message: '备份已触发' })
    }
  }
})

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchInterval: false, retry: false, staleTime: Infinity }
    }
  })
}

const { default: OverviewPage } = await import('@/pages/overview-page')

async function renderOverviewPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <OverviewPage />
    </QueryClientProvider>
  )
}

describe('备份概览页面', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders all KPI metric cards and models', async () => {
    await renderOverviewPage()

    // 检查页面标题
    expect(await screen.findByRole('heading', { name: '备份概览' })).toBeInTheDocument()

    // 检查四大核心指标卡片标题
    expect(screen.getByText('备份模型与调度')).toBeInTheDocument()
    expect(screen.getByText('任务执行成功率')).toBeInTheDocument()
    expect(screen.getByText('系统运行状态')).toBeInTheDocument()
    expect(screen.getByText('归档数据与数据源')).toBeInTheDocument()

    // 检查模型与计划指标计算
    expect(screen.getByText('2')).toBeInTheDocument() // 2个模型
    expect(screen.getByText('1 个已启用计划 · 1 个仅手动')).toBeInTheDocument()
    expect(screen.getByText('覆盖率 50%')).toBeInTheDocument()

    // 检查成功率指标
    expect(screen.getByText('100%')).toBeInTheDocument()

    // 检查运行状态指标
    expect(screen.getByText('系统就绪')).toBeInTheDocument()

    // 检查模型卡片渲染
    expect(screen.getByText('venus')).toBeInTheDocument()
    expect(screen.getByText('redis_cache')).toBeInTheDocument()
    expect(screen.getByText('每天 02:00')).toBeInTheDocument()
    expect(screen.getByText('未启用定时调度')).toBeInTheDocument()
  })
})
