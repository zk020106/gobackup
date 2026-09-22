import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Empty,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Skeleton,
  Switch,
  Table,
  Tag,
  Toast
} from '@douyinfe/semi-ui-19'
import type { ColumnProps } from '@douyinfe/semi-ui-19/lib/es/table'
import { Download, Eye, RefreshCw, Trash2 } from 'lucide-react'

import { backupQueries } from '@/api/backup-queries'
import { gobackupApi, type BackupRun } from '@/api/gobackup'
import { Page, PageSection } from '@/components/page'
import {
  downloadRemoteFile,
  formatBytes,
  formatDateTime,
  formatDuration
} from '@/pages/logs/log-utils'
import LiveTaskLogPanel, { TaskLogDownloadButton } from '@/pages/tasks/task-log-panel'
import { LiveTaskCard, TaskStatusTag, TaskTriggerTag } from '@/pages/tasks/task-progress'
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
  progressText,
  second,
  sortTasks,
  taskLogDownloadUrl
} from '@/pages/tasks/task-utils'

/** 任务列表最多展示的条数，与后端 `limit` 对应。 */
const taskLimit = 50

/**
 * 每秒递增一次的本地时钟，仅供「已运行 xx」这类相对时间展示使用。
 *
 * 它不触发任何请求：任务数据由 React Query 的 refetchInterval 负责刷新。
 */
function useNow(interval: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)

    return () => window.clearInterval(timer)
  }, [interval])

  return now
}

export default function TasksPage() {
  const queryClient = useQueryClient()
  const now = useNow(second)
  const [modelFilter, setModelFilter] = useState('')
  const [onlyRunning, setOnlyRunning] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()

  // 任务中心数据：轮询节奏由 backupQueries.tasks 统一控制（有任务进行中 1s，否则 10s）。
  const tasksQuery = useQuery(backupQueries.tasks())
  const tasks = useMemo(() => sortTasks(tasksQuery.data?.tasks ?? []), [tasksQuery.data])

  // 日志流结束后把任务标记为「已结束」，只影响提示文案，不额外发请求。
  const [endedIds, setEndedIds] = useState<string[]>([])
  // 日志面板是否仍需跟随流；父组件每次打开任务时重置。
  const [streamActive, setStreamActive] = useState(false)

  const selectedTask = useMemo(
    () => tasks.find(task => task.id === selectedId),
    [selectedId, tasks]
  )

  const visibleTasks = useMemo(
    () => filterTasks(tasks, modelFilter, onlyRunning),
    [modelFilter, onlyRunning, tasks]
  )
  const runningTasks = useMemo(() => visibleTasks.filter(isRunningTask), [visibleTasks])

  const modelOptions = useMemo(
    () => [
      { label: '全部模型', value: '' },
      ...modelOptionsOf(tasks).map(name => ({ label: name, value: name }))
    ],
    [tasks]
  )

  // 日志流是否需要继续跟随：任务已结束（本地标记或后端状态）时收尾，只保留已收到的内容。
  const logStreamActive = Boolean(
    selectedTask &&
      streamActive &&
      isRunningTask(selectedTask) &&
      !endedIds.includes(selectedTask.id)
  )

  function openLog(run: BackupRun) {
    setSelectedId(run.id)
    setStreamActive(isRunningTask(run))
    setEndedIds(previous => previous.filter(id => id !== run.id))
  }

  function closeLog() {
    setSelectedId(undefined)
    setStreamActive(false)
  }

  /** 日志流报告任务已结束：更新提示文案，并立刻刷一次任务列表拿到最终结果。 */
  function handleStreamActiveChange(active: boolean) {
    setStreamActive(active)
    if (!active && selectedId) {
      setEndedIds(previous => (previous.includes(selectedId) ? previous : [...previous, selectedId]))
      void queryClient.invalidateQueries({ queryKey: ['gobackup', 'tasks'] })
    }
  }

  async function downloadRunLog(run: BackupRun) {
    try {
      await downloadRemoteFile(taskLogDownloadUrl(run.id), `${run.id}.log`)
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '下载任务日志失败')
    }
  }

  async function removeRun(id: string) {
    try {
      await gobackupApi.deleteRun(id)
      if (selectedId === id) closeLog()
      Toast.success('已删除该任务记录')
      // 删除会影响任务列表、概览和运行记录，统一失效 gobackup 命名空间。
      await queryClient.invalidateQueries({ queryKey: ['gobackup'] })
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '删除任务记录失败')
    }
  }

  // 每列都直接用当前时间戳计算耗时，所以这里不缓存列定义：
  // 计时器每秒更新一次 `now`，缓存反而会让耗时停止跳动。
  const columns: ColumnProps<BackupRun>[] = [
    {
      dataIndex: 'started_at',
      render: (_: unknown, run: BackupRun) => (
        <span className="whitespace-nowrap">{formatDateTime(run.started_at)}</span>
      ),
      title: '开始时间',
      width: 170
    },
    {
      dataIndex: 'model',
      render: (_: unknown, run: BackupRun) => <span className="font-medium">{run.model}</span>,
      title: '模型',
      width: 140
    },
    {
      dataIndex: 'trigger',
      render: (_: unknown, run: BackupRun) => <TaskTriggerTag trigger={run.trigger} />,
      title: '触发方式',
      width: 110
    },
    {
      dataIndex: 'status',
      render: (_: unknown, run: BackupRun) => (
        <div className="flex flex-col items-start gap-1">
          <TaskStatusTag run={run} />
          {run.error ? (
            <span className="line-clamp-1 max-w-64 text-xs text-destructive" title={run.error}>
              {run.error}
            </span>
          ) : null}
        </div>
      ),
      title: '状态/结果',
      width: 220
    },
    {
      dataIndex: 'progress',
      render: (_: unknown, run: BackupRun) => {
        const progress = run.progress
        if (run.running) {
          if (!progress) {
            return <span className="text-xs text-muted-foreground">启动中…</span>
          }
          const percent = progressPercent(progress)
          const isIndeterminate = percent === undefined
          return (
            <div className="grid min-w-36 gap-1">
              <Progress
                aria-label={`列表 ${progressAriaLabel(progress, run.model)}`}
                format={() => progressText(progress)}
                indeterminate={isIndeterminate}
                percent={percent ?? 0}
                showInfo
                size="small"
                stroke="var(--semi-color-primary)"
              />
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {phaseText(progress) ? (
                  <span className="line-clamp-1 max-w-56 truncate" title={phaseText(progress)}>
                    {phaseText(progress)}
                  </span>
                ) : null}
                {bytesText(progress) ? <span>{bytesText(progress)}</span> : null}
              </div>
            </div>
          )
        }

        if (run.status === 'success') {
          return (
            <div className="min-w-32 py-1">
              <Progress
                format={() => '100%'}
                percent={100}
                showInfo
                size="small"
                stroke="var(--semi-color-success)"
              />
            </div>
          )
        }

        if (run.status === 'failure') {
          const percent = Math.round(progress?.percent ?? 0)
          return (
            <div className="min-w-32 py-1">
              <Progress
                format={() => `${percent}%`}
                percent={percent}
                showInfo
                size="small"
                stroke="var(--semi-color-danger)"
              />
            </div>
          )
        }

        return '-'
      },
      title: '进度',
      width: 220
    },
    {
      dataIndex: 'duration_ms',
      render: (_: unknown, run: BackupRun) => formatDuration(elapsedMs(run, now)),
      title: '耗时',
      width: 110
    },
    {
      dataIndex: 'archive_name',
      render: (_: unknown, run: BackupRun) =>
        run.archive_name ? (
          <div className="grid gap-0.5">
            <span className="max-w-56 truncate" title={run.archive_name}>
              {run.archive_name}
            </span>
            <span className="text-xs text-muted-foreground">{formatBytes(run.archive_size)}</span>
          </div>
        ) : (
          '-'
        ),
      title: '归档文件',
      width: 200
    },
    {
      dataIndex: 'id',
      render: (_: unknown, run: BackupRun) => (
        <div className="flex items-center gap-1">
          <Button
            aria-label={`查看 ${run.id} 的日志`}
            icon={<Eye className="size-4" />}
            size="small"
            theme="light"
            type="tertiary"
            onClick={() => openLog(run)}
          >
            查看日志
          </Button>
          <Button
            aria-label={`下载 ${run.id} 的日志`}
            icon={<Download className="size-4" />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => void downloadRunLog(run)}
          />
          <Popconfirm
            content="删除后无法恢复，确定删除这条任务记录？"
            onConfirm={() => void removeRun(run.id)}
            title="删除任务记录"
          >
            <Button
              aria-label={`删除 ${run.id}`}
              icon={<Trash2 className="size-4" />}
              size="small"
              theme="borderless"
              type="danger"
            />
          </Popconfirm>
        </div>
      ),
      title: '操作',
      width: 220
    }
  ]

  return (
    <Page
      actions={
        <Button
          icon={<RefreshCw className="size-4" />}
          loading={tasksQuery.isFetching}
          onClick={() => void tasksQuery.refetch()}
          theme="light"
          type="tertiary"
        >
          刷新
        </Button>
      }
      description="集中查看进行中、排队中和已结束的备份任务，实时跟随进度并逐条查看任务日志。"
      title="任务中心"
    >
      <PageSection
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tag color={runningTasks.length > 0 ? 'orange' : 'green'}>
              {runningTasks.length > 0 ? `进行中 ${runningTasks.length}` : '当前空闲'}
            </Tag>
            <Tag color="blue">共 {tasks.length} 条任务</Tag>
          </div>
        }
        description="进行中的任务每秒刷新一次进度，卡片里的耗时由本地时钟实时计算。"
        title="进行中任务"
      >
        {tasksQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map(item => (
              <Card key={item}>
                <Skeleton active loading />
              </Card>
            ))}
          </div>
        ) : tasksQuery.isError ? (
          <Card>
            <div className="py-8 text-center text-sm text-destructive">
              读取任务列表失败，请检查 GoBackup 服务状态。
            </div>
          </Card>
        ) : runningTasks.length === 0 ? (
          <Card>
            <Empty
              description={
                modelFilter
                  ? `模型 ${modelFilter} 当前没有进行中的任务`
                  : '当前没有进行中的任务，页面会自动刷新最新状态'
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {runningTasks.map(run => (
              <LiveTaskCard
                elapsedText={formatElapsed(elapsedMs(run, now))}
                key={run.id}
                onDownload={run => void downloadRunLog(run)}
                onOpenLog={openLog}
                run={run}
              />
            ))}
          </div>
        )}
      </PageSection>

      <PageSection
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-40"
              optionList={modelOptions}
              value={modelFilter}
              onChange={next => setModelFilter(String(next))}
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {/* 可见文字即标签，无需再加 aria-label。 */}
              <Switch checked={onlyRunning} onChange={setOnlyRunning} size="small" />
              只看进行中
            </label>
            <Button
              icon={<RefreshCw className="size-4" />}
              loading={tasksQuery.isFetching}
              onClick={() => void tasksQuery.refetch()}
              theme="light"
              type="tertiary"
            >
              刷新
            </Button>
          </div>
        }
        description={`进行中的任务排在最前，其余按开始时间倒序；最多展示最近 ${taskLimit} 条。`}
        title="任务列表"
      >
        <Card shadows="hover">
          {tasksQuery.isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              读取任务列表失败，请检查 GoBackup 服务状态。
            </div>
          ) : (
            <Table<BackupRun>
              columns={columns}
              dataSource={visibleTasks}
              empty={<Empty description="还没有任务记录，执行一次备份后就会出现在这里" />}
              loading={tasksQuery.isLoading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              rowKey="id"
              size="middle"
            />
          )}
        </Card>
      </PageSection>

      <Modal
        footer={
          <div className="flex justify-end gap-2">
            {selectedTask ? <TaskLogDownloadButton taskId={selectedTask.id} /> : null}
            <Button onClick={closeLog} theme="solid" type="primary">
              关闭
            </Button>
          </div>
        }
        onCancel={closeLog}
        title={
          selectedTask ? `${selectedTask.model} · ${selectedTask.id}` : '任务日志'
        }
        visible={Boolean(selectedId)}
        width={900}
      >
        {selectedTask ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <TaskStatusTag run={selectedTask} />
              <span>开始于 {formatDateTime(selectedTask.started_at)}</span>
              <span>已运行 {formatElapsed(elapsedMs(selectedTask, now))}</span>
              {endedIds.includes(selectedTask.id) || !selectedTask.running ? (
                <span>任务已结束</span>
              ) : null}
            </div>

            {selectedTask.error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm break-all text-destructive">
                {selectedTask.error}
              </div>
            ) : null}

            <LiveTaskLogPanel
              active={logStreamActive}
              onActiveChange={handleStreamActiveChange}
              taskId={selectedTask.id}
            />
          </div>
        ) : null}
      </Modal>
    </Page>
  )
}
