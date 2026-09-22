import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button, Card, Empty, Input, Progress, Skeleton, Tag, Toast } from '@douyinfe/semi-ui-19'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Database,
  FolderOpen,
  HardDrive,
  Layers,
  ListChecks,
  Play,
  RefreshCw,
  Search,
  Settings
} from 'lucide-react'

import { backupQueries } from '@/api/backup-queries'
import { gobackupApi, type BackupRun } from '@/api/gobackup'
import { Page, PageSection } from '@/components/page'
import { HttpError } from '@/lib/http'
import { formatBytes, formatDateTime, formatDuration } from '@/pages/logs/log-utils'

type ModelStatusFilter = 'all' | 'scheduled' | 'manual' | 'failure'

export default function OverviewPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: models = {}, isError, isLoading, refetch } = useQuery(backupQueries.models())
  const [runningModel, setRunningModel] = useState<string>()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<ModelStatusFilter>('all')

  // 获取所有任务（含历史记录与进行中任务），开销很小，且包含进行中任务时会自动高频轮询
  const tasksQuery = useQuery(backupQueries.tasks({ includeFinished: true }))
  const tasks = tasksQuery.data?.tasks ?? []

  const runningTasks = useMemo(() => tasks.filter(task => task.running), [tasks])
  const finishedTasks = useMemo(() => tasks.filter(task => !task.running), [tasks])
  const successTasks = useMemo(() => finishedTasks.filter(task => task.status === 'success'), [finishedTasks])
  const failureTasks = useMemo(() => finishedTasks.filter(task => task.status === 'failure'), [finishedTasks])

  // 按模型映射正在运行的任务
  const runningByModel = useMemo(() => {
    const map = new Map<string, BackupRun>()
    runningTasks.forEach(task => {
      map.set(task.model, task)
    })
    return map
  }, [runningTasks])

  // 按模型映射最近一次执行记录
  const lastRunByModel = useMemo(() => {
    const map = new Map<string, BackupRun>()
    // tasks 列表按时间降序排列，首次遇到的即为该模型的最新一次记录
    tasks.forEach(task => {
      if (!map.has(task.model)) {
        map.set(task.model, task)
      }
    })
    return map
  }, [tasks])

  // 按模型映射最近一次成功执行记录（用于计算各模型最新归档大小之和）
  const lastSuccessByModel = useMemo(() => {
    const map = new Map<string, BackupRun>()
    successTasks.forEach(task => {
      if (!map.has(task.model) && (task.archive_size ?? 0) > 0) {
        map.set(task.model, task)
      }
    })
    return map
  }, [successTasks])

  const modelEntries = Object.entries(models)
  const scheduledCount = useMemo(
    () => modelEntries.filter(([, model]) => model.schedule?.enabled).length,
    [modelEntries]
  )
  const manualCount = modelEntries.length - scheduledCount
  const planCoverage = modelEntries.length > 0 ? Math.round((scheduledCount / modelEntries.length) * 100) : 0

  // 成功率统计
  const successRate = finishedTasks.length > 0 ? Math.round((successTasks.length / finishedTasks.length) * 100) : 100

  // 统计最近归档数据总量（各模型最新成功归档之和）
  const totalArchiveBytes = useMemo(() => {
    let sum = 0
    lastSuccessByModel.forEach(run => {
      sum += run.archive_size ?? 0
    })
    return sum
  }, [lastSuccessByModel])

  // 统计所有纳管数据库及类型分布
  const { totalDatabases, databaseTypesText } = useMemo(() => {
    let count = 0
    const typeCountMap: Record<string, number> = {}
    modelEntries.forEach(([, model]) => {
      if (model.databases) {
        count += model.databases.length
        model.databases.forEach(db => {
          const type = (db.type || 'other').toUpperCase()
          typeCountMap[type] = (typeCountMap[type] ?? 0) + 1
        })
      }
    })
    const typeParts = Object.entries(typeCountMap).map(([type, c]) => `${type}: ${c}`)
    return {
      totalDatabases: count,
      databaseTypesText: typeParts.length > 0 ? typeParts.join(' · ') : '暂无数据源'
    }
  }, [modelEntries])

  // 最近一次完成的任务
  const latestFinishedRun = finishedTasks[0]

  // 模型过滤逻辑
  const filteredModelEntries = useMemo(() => {
    return modelEntries.filter(([name, model]) => {
      // 关键词过滤（匹配模型名称或数据库名/类型）
      if (searchKeyword.trim()) {
        const needle = searchKeyword.trim().toLowerCase()
        const matchName = name.toLowerCase().includes(needle)
        const matchDesc = model.description?.toLowerCase().includes(needle)
        const matchDb = model.databases?.some(
          db => db.name.toLowerCase().includes(needle) || db.type.toLowerCase().includes(needle)
        )
        if (!matchName && !matchDesc && !matchDb) return false
      }

      // 状态筛选
      if (statusFilter === 'scheduled') {
        return Boolean(model.schedule?.enabled)
      }
      if (statusFilter === 'manual') {
        return !model.schedule?.enabled
      }
      if (statusFilter === 'failure') {
        const last = lastRunByModel.get(name)
        return last?.status === 'failure'
      }

      return true
    })
  }, [modelEntries, searchKeyword, statusFilter, lastRunByModel])

  async function performBackup(model: string) {
    setRunningModel(model)

    try {
      const response = await gobackupApi.perform(model)
      Toast.success(response.message ?? `已启动 ${model} 备份`)
      // 立刻刷新一次任务列表，进度条能马上出现
      await queryClient.invalidateQueries({ queryKey: ['gobackup', 'tasks'] })
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        Toast.warning(error.message)
      } else {
        Toast.error(error instanceof Error ? error.message : '启动备份失败')
      }
    } finally {
      setRunningModel(undefined)
    }
  }

  return (
    <Page
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<ListChecks className="size-4" />}
            onClick={() => void navigate({ to: '/tasks' })}
            theme="light"
            type="tertiary"
          >
            任务中心
          </Button>
          <Button
            icon={<Settings className="size-4" />}
            onClick={() => void navigate({ to: '/settings/config' })}
            theme="light"
            type="tertiary"
          >
            配置管理
          </Button>
          <Button
            icon={<RefreshCw className="size-4" />}
            loading={isLoading || tasksQuery.isFetching}
            onClick={() => {
              void refetch()
              void tasksQuery.refetch()
            }}
            theme="light"
            type="tertiary"
          >
            刷新
          </Button>
        </div>
      }
      description="全局监控备份运行状态、成功率、数据体量与各模型调度计划。"
      title="备份概览"
    >
      {/* 核心指标概览卡片 */}
      <PageSection contentClassName="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card shadows="hover" title={<span className="text-xs text-muted-foreground font-medium">备份模型与调度</span>}>
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Layers className="size-6 text-primary" />
              {isLoading ? <Skeleton.Title style={{ height: 28, width: 48 }} /> : `${modelEntries.length}`}
              <span className="text-xs font-normal text-muted-foreground">个模型</span>
            </div>
            <Tag color={planCoverage > 0 ? 'blue' : 'grey'} className="w-fit">
              覆盖率 {planCoverage}%
            </Tag>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {isLoading ? <Skeleton.Paragraph rows={1} /> : `${scheduledCount} 个已启用计划 · ${manualCount} 个仅手动`}
          </div>
        </Card>

        <Card shadows="hover" title={<span className="text-xs text-muted-foreground font-medium">任务执行成功率</span>}>
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-2xl font-bold">
              <CheckCircle2 className="size-6 text-success" />
              {tasksQuery.isLoading ? (
                <Skeleton.Title style={{ height: 28, width: 48 }} />
              ) : finishedTasks.length === 0 ? (
                <span className="text-lg font-medium text-muted-foreground">暂无记录</span>
              ) : (
                `${successRate}%`
              )}
            </div>
            {finishedTasks.length > 0 ? (
              <Tag color={failureTasks.length === 0 ? 'green' : 'red'} className="w-fit">
                {failureTasks.length === 0 ? '全部成功' : `${failureTasks.length} 次失败`}
              </Tag>
            ) : null}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {tasksQuery.isLoading ? (
              <Skeleton.Paragraph rows={1} />
            ) : (
              `最近执行 ${finishedTasks.length} 次：${successTasks.length} 成功 · ${failureTasks.length} 失败`
            )}
          </div>
        </Card>

        <Card shadows="hover" title={<span className="text-xs text-muted-foreground font-medium">系统运行状态</span>}>
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Activity className="size-6 text-blue-500" />
              {runningTasks.length > 0 ? (
                <Tag color="orange" size="large" className="w-fit">
                  备份中 ({runningTasks.length})
                </Tag>
              ) : (
                <Tag color="green" size="large" className="w-fit">
                  系统就绪
                </Tag>
              )}
            </div>
          </div>
          <div className="mt-2 truncate text-xs text-muted-foreground" title={latestFinishedRun ? `上次执行：${formatDateTime(latestFinishedRun.started_at)}` : undefined}>
            {latestFinishedRun
              ? `上次执行: ${formatDateTime(latestFinishedRun.started_at)} · ${latestFinishedRun.status === 'success' ? '成功' : '失败'}`
              : '近期暂无执行记录'}
          </div>
        </Card>

        <Card shadows="hover" title={<span className="text-xs text-muted-foreground font-medium">归档数据与数据源</span>}>
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-2xl font-bold">
              <HardDrive className="size-6 text-purple-500" />
              {tasksQuery.isLoading ? <Skeleton.Title style={{ height: 28, width: 48 }} /> : formatBytes(totalArchiveBytes)}
            </div>
            <Tag color="violet" className="w-fit">
              {totalDatabases} 个数据源
            </Tag>
          </div>
          <div className="mt-2 truncate text-xs text-muted-foreground" title={databaseTypesText}>
            {databaseTypesText}
          </div>
        </Card>
      </PageSection>

      {/* 异常警示条：如果有最近备份失败 */}
      {failureTasks.length > 0 ? (
        <PageSection>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 shrink-0" />
              <span>
                最近发现 <strong>{failureTasks.length}</strong> 次备份任务执行失败。最新失败模型：
                <strong>{failureTasks[0].model}</strong>
                {failureTasks[0].error ? `（${failureTasks[0].error}）` : ''}
              </span>
            </div>
            <Button
              onClick={() => void navigate({ to: '/tasks' })}
              size="small"
              theme="solid"
              type="danger"
            >
              前往任务中心排查
            </Button>
          </div>
        </PageSection>
      ) : null}

      {/* 正在执行的任务实时状态栏 */}
      {runningTasks.length > 0 ? (
        <PageSection description="实时跟踪当前正在执行的备份任务进度。" title="进行中任务">
          <div className="grid gap-4 md:grid-cols-2">
            {runningTasks.map(task => {
              const progress = task.progress
              return (
                <Card
                  key={task.id}
                  headerExtraContent={<Tag color="orange" className="w-fit">执行中</Tag>}
                  shadows="hover"
                  title={<span className="font-semibold uppercase">{task.model}</span>}
                >
                  <div className="grid gap-2">
                    <div className="text-xs text-muted-foreground">
                      开始于 {formatDateTime(task.started_at)} · 触发源：{task.trigger === 'schedule' ? '计划任务' : '网页/API'}
                    </div>
                    <Progress
                      format={() => (progress ? `${Math.round(progress.percent)}%` : '进行中')}
                      percent={progress ? Math.round(progress.percent) : 0}
                      showInfo
                      stroke="var(--semi-color-primary)"
                    />
                    <div className="text-xs text-muted-foreground">
                      {progress?.phase ? `${progress.phase} · ` : ''}
                      {progress?.detail || '正在执行备份…'}
                    </div>
                    {progress?.bytes_done ? (
                      <div className="text-xs text-muted-foreground">
                        已处理 {formatBytes(progress.bytes_done)}
                        {progress.bytes_total ? ` / ${formatBytes(progress.bytes_total)}` : ''}
                      </div>
                    ) : null}
                    <div className="mt-1 flex justify-end">
                      <Button
                        onClick={() => void navigate({ to: '/tasks' })}
                        size="small"
                        theme="light"
                        type="tertiary"
                      >
                        查看任务详情
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </PageSection>
      ) : null}

      {/* 备份模型列表 */}
      <PageSection
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-48 sm:w-64"
              placeholder="搜索模型或数据库..."
              prefix={<Search className="size-4 text-muted-foreground" />}
              showClear
              value={searchKeyword}
              onChange={setSearchKeyword}
            />
            <div className="flex items-center gap-1 rounded-md border p-1 text-xs">
              <button
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => setStatusFilter('all')}
                type="button"
              >
                全部 ({modelEntries.length})
              </button>
              <button
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'scheduled'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => setStatusFilter('scheduled')}
                type="button"
              >
                已计划 ({scheduledCount})
              </button>
              <button
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'manual'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => setStatusFilter('manual')}
                type="button"
              >
                手动 ({manualCount})
              </button>
              {failureTasks.length > 0 ? (
                <button
                  className={`rounded px-2 py-1 font-medium transition-colors ${
                    statusFilter === 'failure'
                      ? 'bg-destructive text-destructive-foreground'
                      : 'text-destructive hover:bg-destructive/10'
                  }`}
                  onClick={() => setStatusFilter('failure')}
                  type="button"
                >
                  有失败
                </button>
              ) : null}
            </div>
          </div>
        }
        description="每个模型对应一个备份方案和默认存储。同一数据库环境同一时间只允许一个任务运行。"
        title="备份模型"
      >
        {isError ? (
          <Card>
            <div className="py-8 text-center text-sm text-destructive">无法读取备份模型，请检查 GoBackup 服务状态。</div>
          </Card>
        ) : isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(item => (
              <Card key={item}>
                <Skeleton loading active />
              </Card>
            ))}
          </div>
        ) : filteredModelEntries.length === 0 ? (
          <Card>
            <Empty description={searchKeyword || statusFilter !== 'all' ? '未找到符合条件的备份模型' : '暂无备份模型'} />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredModelEntries.map(([name, model]) => {
              const runningTask = runningByModel.get(name)
              const lastRun = lastRunByModel.get(name)
              const busy = Boolean(runningTask) || Boolean(model.running)
              const progress = runningTask?.progress

              return (
                <Card
                  key={name}
                  shadows="hover"
                  title={<span className="font-semibold uppercase tracking-wide">{name}</span>}
                  headerExtraContent={
                    busy ? (
                      <Tag color="orange" className="w-fit">执行中</Tag>
                    ) : lastRun?.status === 'failure' ? (
                      <Tag color="red" className="w-fit">上次失败</Tag>
                    ) : model.schedule?.enabled ? (
                      <Tag color="green" className="w-fit">已计划</Tag>
                    ) : (
                      <Tag color="grey" className="w-fit">手动</Tag>
                    )
                  }
                >
                  <div className="flex min-h-36 flex-col justify-between gap-4">
                    <div>
                      {/* 计划调度状态 */}
                      <div className="flex items-center gap-1.5 text-xs">
                        <Clock className="size-3.5 text-muted-foreground" />
                        {model.schedule?.enabled && model.schedule_info ? (
                          <span className="font-medium text-success">{model.schedule_info}</span>
                        ) : (
                          <span className="text-muted-foreground">未启用定时调度</span>
                        )}
                      </div>

                      {/* 描述 */}
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {model.description || '未设置描述'}
                      </p>

                      {/* 上次执行指标面板 */}
                      <div className="mt-3 rounded-md bg-background-deep p-2.5 text-xs">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>上次执行</span>
                          <span className="font-medium text-foreground">
                            {lastRun ? formatDateTime(lastRun.started_at) : '暂无记录'}
                          </span>
                        </div>
                        {lastRun ? (
                          <div className="mt-1.5 flex items-center justify-between border-t border-border/40 pt-1.5">
                            <span className="flex items-center gap-1">
                              结果:
                              <Tag
                                color={lastRun.status === 'success' ? 'green' : lastRun.status === 'running' ? 'orange' : 'red'}
                                size="small"
                                className="w-fit"
                              >
                                {lastRun.status === 'success' ? '成功' : lastRun.status === 'running' ? '进行中' : '失败'}
                              </Tag>
                            </span>
                            <span className="text-muted-foreground">
                              耗时: <strong className="font-medium text-foreground">{formatDuration(lastRun.duration_ms)}</strong>
                            </span>
                            {lastRun.archive_size ? (
                              <span className="text-muted-foreground">
                                归档: <strong className="font-medium text-foreground">{formatBytes(lastRun.archive_size)}</strong>
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {lastRun?.error ? (
                          <div className="mt-1.5 truncate text-[11px] text-destructive" title={lastRun.error}>
                            错误：{lastRun.error}
                          </div>
                        ) : null}
                      </div>

                      {/* 包含数据库 */}
                      {model.databases && model.databases.length > 0 ? (
                        <div className="mt-3">
                          <div className="mb-1 text-[11px] text-muted-foreground flex items-center gap-1">
                            <Database className="size-3" /> 数据源 ({model.databases.length}):
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {model.databases.map(database => (
                              <Tag key={database.name} color="blue" size="small" className="w-fit">
                                {database.type}:{database.name}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* 进行中进度条 */}
                      {runningTask ? (
                        <div className="mt-3 grid gap-1">
                          <Progress
                            format={() => (progress ? `${Math.round(progress.percent)}%` : '进行中')}
                            percent={progress ? Math.round(progress.percent) : 0}
                            showInfo
                            stroke="var(--semi-color-primary)"
                          />
                          <div className="text-xs text-muted-foreground">
                            {progress?.phase ? `${progress.phase} · ` : ''}
                            {progress?.detail || '正在执行备份'}
                          </div>
                          {progress?.bytes_done && !progress.bytes_total ? (
                            <div className="text-xs text-muted-foreground">
                              已处理 {formatBytes(progress.bytes_done)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* 冲突提示 */}
                      {!runningTask && model.conflict ? (
                        <div className="mt-2 line-clamp-2 text-xs text-warning" title={model.conflict}>
                          ⚠️ {model.conflict}
                        </div>
                      ) : null}
                    </div>

                    {/* 操作按钮组 */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                      <Button
                        disabled={busy}
                        icon={<Play className="size-4" />}
                        loading={runningModel === name}
                        onClick={() => void performBackup(name)}
                        theme="solid"
                        type="primary"
                        title={busy ? '该模型已有进行中的任务' : undefined}
                      >
                        {busy ? '备份中' : '立即备份'}
                      </Button>
                      <Button
                        icon={<FolderOpen className="size-4" />}
                        onClick={() => void navigate({ to: `/browser/${encodeURIComponent(name)}` as any })}
                        theme="light"
                        type="tertiary"
                      >
                        浏览归档
                      </Button>
                      <Button
                        icon={<ListChecks className="size-4" />}
                        onClick={() => void navigate({ to: '/tasks' })}
                        theme="borderless"
                        type="tertiary"
                        title="查看任务记录"
                      >
                        记录
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </PageSection>

      <PageSection>
        <Card shadows="hover">
          <a
            className="flex items-center gap-2 text-sm text-primary hover:underline"
            href="https://github.com/gobackup/gobackup"
            rel="noreferrer"
            target="_blank"
          >
            查看 GoBackup 项目文档 <ArrowUpRight className="size-4" />
          </a>
        </Card>
      </PageSection>
    </Page>
  )
}
