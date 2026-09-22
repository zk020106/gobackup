import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Empty,
  Input,
  Progress,
  Tag,
  Toast,
  Collapse
} from '@douyinfe/semi-ui-19'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Search,
  Server,
  Terminal,
  XCircle
} from 'lucide-react'

import { environmentApi } from '@/api/environment'
import { Page, PageSection } from '@/components/page'

type ToolFilterCategory = 'all' | 'database' | 'system' | 'missing'

const pmNames: Record<string, string> = {
  apt: 'Ubuntu / Debian (apt)',
  dnf: 'openEuler / Anolis / 麒麟 / RHEL 8+ (dnf)',
  yum: 'CentOS 7 (yum)',
  apk: 'Alpine Linux (apk)',
  pacman: 'Arch Linux (pacman)',
  winget: 'Windows (winget)',
  choco: 'Windows (Chocolatey)',
  windows: 'Windows (通用)',
  brew: 'macOS (Homebrew)'
}

function EnvironmentPageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 顶部指标卡片骨架 */}
      <PageSection>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 卡片 1: 宿主机系统 */}
          <Card>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-16 rounded bg-muted/70" />
                <div className="h-6 w-28 rounded bg-muted/90" />
                <div className="h-3 w-24 rounded bg-muted/60" />
              </div>
              <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Server className="size-5 text-primary/40" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-border/60">
              <div className="h-5 w-20 rounded bg-muted/60" />
              <div className="h-3 w-16 rounded bg-muted/40" />
            </div>
          </Card>

          {/* 卡片 2: 数据库工具链 */}
          <Card>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-20 rounded bg-muted/70" />
                <div className="h-6 w-16 rounded bg-muted/90" />
                <div className="h-3 w-32 rounded bg-muted/60" />
              </div>
              <div className="size-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Database className="size-5 text-amber-500/40" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-border/60">
              <div className="h-3 w-40 rounded bg-muted/50" />
            </div>
          </Card>

          {/* 卡片 3: 系统内存 */}
          <Card>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-20 rounded bg-muted/70" />
                <div className="h-6 w-24 rounded bg-muted/90" />
                <div className="h-3 w-16 rounded bg-muted/60" />
              </div>
              <div className="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Cpu className="size-5 text-emerald-500/40" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-border/60">
              <div className="h-2 w-full rounded-full bg-muted/60" />
            </div>
          </Card>

          {/* 卡片 4: 磁盘空间 */}
          <Card>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-24 rounded bg-muted/70" />
                <div className="h-6 w-24 rounded bg-muted/90" />
                <div className="h-3 w-36 rounded bg-muted/60" />
              </div>
              <div className="size-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <HardDrive className="size-5 text-blue-500/40" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-border/60">
              <div className="h-2 w-full rounded-full bg-muted/60" />
            </div>
          </Card>
        </div>
      </PageSection>

      {/* 服务进程状态条骨架 */}
      <PageSection>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background-deep p-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-4 w-36 rounded bg-muted/60" />
            <div className="h-4 w-28 rounded bg-muted/60" />
            <div className="h-4 w-44 rounded bg-muted/50 hidden md:block" />
            <div className="h-4 w-48 rounded bg-muted/50 hidden lg:block" />
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-muted/70" />
            <div className="h-3.5 w-24 rounded bg-muted/60" />
          </div>
        </div>
      </PageSection>

      {/* 工具列表骨架 */}
      <PageSection>
        <Card shadows="hover" title={<div className="h-5 w-48 rounded bg-muted/70" />}>
          {/* 工具条骨架 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border/60">
            <div className="flex flex-wrap gap-2">
              <div className="h-7 w-20 rounded-md bg-primary/20" />
              <div className="h-7 w-24 rounded-md bg-muted/60" />
              <div className="h-7 w-32 rounded-md bg-muted/60" />
              <div className="h-7 w-24 rounded-md bg-muted/60" />
            </div>
            <div className="h-8 w-60 rounded-md bg-muted/50" />
          </div>

          {/* 工具列表项骨架 */}
          <div className="divide-y divide-border/60 pt-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                className="py-4.5 px-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                key={i}
              >
                <div className="flex items-start gap-3 w-full lg:max-w-2xl">
                  <div className="size-9 rounded-md bg-muted/60 shrink-0 mt-0.5" />
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="h-4 w-24 rounded bg-muted/80" />
                      <div className="h-5 w-12 rounded bg-muted/60" />
                      <div className="h-4 w-20 rounded bg-muted/40" />
                      <div className="h-5 w-16 rounded bg-muted/50" />
                    </div>
                    <div className="h-3.5 w-4/5 rounded bg-muted/50" />
                    <div className="h-3 w-3/5 rounded bg-muted/40" />
                  </div>
                </div>
                <div className="w-full lg:max-w-md shrink-0">
                  <div className="h-12 rounded-md bg-muted/40 border border-border/40" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </PageSection>
    </div>
  )
}

export default function EnvironmentPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['system', 'environment'],
    queryFn: ({ signal }) => environmentApi.get(signal),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    gcTime: 5 * 60_000
  })

  const [activeCategory, setActiveCategory] = useState<ToolFilterCategory>('all')
  const [keyword, setKeyword] = useState('')

  const tools = data?.tools ?? []

  const filteredTools = useMemo(() => {
    return tools.filter(tool => {
      // 类别筛选
      if (activeCategory === 'database' && tool.category !== 'database') return false
      if (activeCategory === 'system' && tool.category === 'database') return false
      if (activeCategory === 'missing' && tool.installed) return false

      // 关键词筛选
      if (keyword.trim()) {
        const query = keyword.toLowerCase().trim()
        const matchName = tool.name.toLowerCase().includes(query)
        const matchLabel = tool.label.toLowerCase().includes(query)
        const matchDesc = tool.description.toLowerCase().includes(query)
        return matchName || matchLabel || matchDesc
      }

      return true
    })
  }, [tools, activeCategory, keyword])

  const missingToolsCount = useMemo(() => tools.filter(t => !t.installed).length, [tools])

  function handleCopy(text: string, label: string) {
    if (!text) return
    navigator.clipboard
      .writeText(text)
      .then(() => {
        Toast.success(`已复制 ${label} 安装命令`)
      })
      .catch(() => {
        Toast.error('复制失败，请手动选择复制')
      })
  }

  function formatUptime(seconds: number) {
    if (seconds < 60) return `${seconds} 秒`
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours < 24) return `${hours} 小时 ${minutes} 分钟`
    const days = Math.floor(hours / 24)
    return `${days} 天 ${hours % 24} 小时`
  }

  if (isLoading && !data) {
    return (
      <Page
        actions={
          <Button
            disabled
            icon={<RefreshCw className="size-4 animate-spin text-muted-foreground" />}
            theme="solid"
            type="primary"
          >
            正在检测...
          </Button>
        }
        description="实时探测宿主机操作系统状态、磁盘/内存资源以及各类数据库转储（mysqldump/pg_dump等）与系统打包工具链就绪情况。"
        title="环境检测与系统诊断"
      >
        <EnvironmentPageSkeleton />
      </Page>
    )
  }

  if (isError || !data) {
    return (
      <Page
        actions={
          <Button
            icon={<RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />}
            loading={isFetching}
            onClick={() => refetch()}
            theme="solid"
            type="primary"
          >
            重试
          </Button>
        }
        description="实时探测宿主机操作系统状态、磁盘/内存资源以及各类数据库转储（mysqldump/pg_dump等）与系统打包工具链就绪情况。"
        title="环境检测与系统诊断"
      >
        <Card className="border-destructive/40 bg-destructive/5 text-center py-6">
          <div className="flex flex-col items-center justify-center gap-2 text-destructive">
            <AlertCircle className="size-8" />
            <div className="font-semibold">获取系统环境信息失败</div>
            <div className="text-xs text-muted-foreground">请检查后端服务运行状态或重新检测</div>
            <Button className="mt-2" onClick={() => refetch()} size="small">
              重试
            </Button>
          </div>
        </Card>
      </Page>
    )
  }

  return (
    <Page
      actions={
        <Button
          icon={<RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />}
          loading={isFetching}
          onClick={() => {
            void refetch()
            Toast.info('已触发重新检测')
          }}
          theme="solid"
          type="primary"
        >
          重新检测环境
        </Button>
      }
      description="实时探测宿主机操作系统状态、磁盘/内存资源以及各类数据库转储（mysqldump/pg_dump等）与系统打包工具链就绪情况。"
      title="环境检测与系统诊断"
    >
      {/* 顶部指标卡片 */}
      <PageSection>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 卡片 1: 操作系统 */}
            <Card shadows="hover">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">宿主机系统</div>
                  <div className="mt-1 text-lg font-bold text-foreground truncate" title={data.host.platform}>
                    {data.host.platform || data.host.os}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {data.host.arch} · {data.host.cpu_cores} 核 CPU
                  </div>
                </div>
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <Server className="size-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-border/60">
                <Tag color="cyan" size="small">
                  包管理: {data.host.preferred_pm}
                </Tag>
                <span className="text-[11px] text-muted-foreground truncate" title={data.host.hostname}>
                  {data.host.hostname}
                </span>
              </div>
            </Card>

            {/* 卡片 2: 数据库工具链 */}
            <Card shadows="hover">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">数据库工具链</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {data.summary.ready_database_tools} / {data.summary.total_database_tools}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {data.summary.ready_database_tools === data.summary.total_database_tools ? (
                      <span className="text-success inline-flex items-center gap-1">
                        <CheckCircle2 className="size-3.5" /> 常用转储工具均已就绪
                      </span>
                    ) : (
                      <span className="text-warning inline-flex items-center gap-1">
                        <AlertCircle className="size-3.5" /> 存在未安装的转储工具
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-500">
                  <Database className="size-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
                <span>涵盖 MySQL、Postgres、Redis、Mongo 等</span>
              </div>
            </Card>

            {/* 卡片 3: 系统内存 */}
            <Card shadows="hover">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">系统运行内存</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {data.runtime.memory_total_mb > 0
                      ? `${(data.runtime.memory_used_mb / 1024).toFixed(1)} / ${(data.runtime.memory_total_mb / 1024).toFixed(1)} GB`
                      : `${data.runtime.memory_alloc_mb.toFixed(1)} MB`}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    使用率 {data.runtime.memory_percent.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-500">
                  <Cpu className="size-5" />
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-border/60">
                <Progress
                  percent={Math.min(100, Math.round(data.runtime.memory_percent))}
                  size="small"
                  stroke={data.runtime.memory_percent > 85 ? 'var(--semi-color-danger)' : undefined}
                />
              </div>
            </Card>

            {/* 卡片 4: 临时工作目录磁盘空间 */}
            <Card shadows="hover">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">临时工作目录磁盘空间</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {data.runtime.disk_free_gb.toFixed(1)} GB 可用
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    总容量 {data.runtime.disk_total_gb.toFixed(1)} GB (已用 {data.runtime.disk_percent.toFixed(1)}%)
                  </div>
                </div>
                <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-500">
                  <HardDrive className="size-5" />
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-border/60">
                <Progress
                  percent={Math.min(100, Math.round(data.runtime.disk_percent))}
                  size="small"
                  stroke={data.runtime.disk_percent > 90 ? 'var(--semi-color-danger)' : undefined}
                />
              </div>
            </Card>
          </div>
      </PageSection>

      {/* 服务进程状态条 */}
      {data?.runtime && (
        <PageSection>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background-deep p-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="font-semibold text-foreground">GoBackup 实例:</span>{' '}
                <span className="font-mono">PID {data.runtime.pid}</span> (v{data.runtime.version})
              </div>
              <div>
                <span className="font-semibold text-foreground">已运行:</span>{' '}
                <span>{formatUptime(data.runtime.uptime_seconds)}</span>
              </div>
              <div className="hidden md:inline truncate max-w-xs" title={data.runtime.config_file}>
                <span className="font-semibold text-foreground">配置文件:</span>{' '}
                <span className="font-mono">{data.runtime.config_file || '默认'}</span>
              </div>
              <div className="hidden lg:inline truncate max-w-xs" title={data.runtime.temp_dir || data.runtime.disk_path}>
                <span className="font-semibold text-foreground">临时工作目录:</span>{' '}
                <span className="font-mono">{data.runtime.temp_dir || data.runtime.disk_path}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-success animate-pulse" />
              <span className="text-success font-medium">服务正常运行中</span>
            </div>
          </div>
        </PageSection>
      )}

      {/* 工具链检测与安装指令 */}
      <PageSection>
        <Card shadows="hover" title="环境工具链检测与安装指引">
          {/* 筛选与搜索工具条 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border/60">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setActiveCategory('all')}
                size="small"
                theme={activeCategory === 'all' ? 'solid' : 'light'}
                type="primary"
              >
                全部工具 ({tools.length})
              </Button>
              <Button
                onClick={() => setActiveCategory('database')}
                size="small"
                theme={activeCategory === 'database' ? 'solid' : 'light'}
                type="primary"
              >
                数据库导出 ({tools.filter(t => t.category === 'database').length})
              </Button>
              <Button
                onClick={() => setActiveCategory('system')}
                size="small"
                theme={activeCategory === 'system' ? 'solid' : 'light'}
                type="primary"
              >
                打包/加密/传输 ({tools.filter(t => t.category !== 'database').length})
              </Button>
              <Button
                onClick={() => setActiveCategory('missing')}
                size="small"
                theme={activeCategory === 'missing' ? 'solid' : 'light'}
                type={missingToolsCount > 0 ? 'warning' : 'tertiary'}
              >
                仅看未安装 ({missingToolsCount})
              </Button>
            </div>

            <div className="w-full sm:w-64">
              <Input
                onChange={setKeyword}
                placeholder="搜索工具名、功能..."
                prefix={<Search className="size-3.5 text-muted-foreground" />}
                showClear
                size="small"
                value={keyword}
              />
            </div>
          </div>

          {/* 工具列表 */}
          {filteredTools.length === 0 ? (
            <div className="py-12 text-center">
              <Empty
                description={
                  activeCategory === 'missing'
                    ? '太棒了！所有检测工具均已安装就绪。'
                    : '没有找到匹配的工具。'
                }
                title="无匹配工具"
              />
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filteredTools.map(tool => {
                const isInstalled = tool.installed
                const defaultCmd = tool.default_command
                const preferredPM = data?.host.preferred_pm || 'apt'

                return (
                  <div
                    className="py-4.5 transition-colors hover:bg-muted/15 rounded-lg px-2"
                    key={tool.name}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      {/* 工具名称与描述 */}
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 rounded-md p-2 shrink-0 ${
                            isInstalled
                              ? 'bg-success/10 text-success'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {isInstalled ? (
                            <CheckCircle2 className="size-5" />
                          ) : (
                            <XCircle className="size-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">
                              {tool.label}
                            </span>
                            <Tag color={isInstalled ? 'green' : 'red'} size="small">
                              {isInstalled ? '已就绪' : '未安装'}
                            </Tag>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80">
                              {tool.name}
                            </code>
                            <Tag color="grey" size="small">
                              {tool.category === 'database' ? '数据库组件' : '系统工具'}
                            </Tag>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                            {tool.description}
                          </div>

                          {/* 已安装状态详情 */}
                          {isInstalled && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
                              <span className="text-foreground/90 truncate max-w-md" title={tool.path}>
                                路径: {tool.path}
                              </span>
                              {tool.version && (
                                <span className="text-muted-foreground/80 truncate max-w-sm" title={tool.version}>
                                  版本: {tool.version}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 未安装时：安装指令栏 */}
                      {!isInstalled && (
                        <div className="w-full lg:max-w-xl shrink-0 mt-2 lg:mt-0">
                          {defaultCmd ? (
                            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                              <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-medium mb-1.5">
                                <span className="flex items-center gap-1">
                                  <Terminal className="size-3.5" /> 当前系统推荐安装命令 (
                                  {pmNames[preferredPM] || preferredPM})
                                </span>
                                <Button
                                  icon={<Copy className="size-3" />}
                                  onClick={() => handleCopy(defaultCmd, tool.name)}
                                  size="small"
                                  theme="borderless"
                                  type="warning"
                                >
                                  复制命令
                                </Button>
                              </div>
                              <div className="overflow-x-auto rounded bg-background/80 p-2 font-mono text-xs text-foreground select-all border border-border/40">
                                {defaultCmd}
                              </div>

                              {/* 展开其它系统安装命令 */}
                              <div className="mt-2">
                                <Collapse>
                                  <Collapse.Panel
                                    header={
                                      <span className="text-[11px] text-muted-foreground hover:text-foreground">
                                        查看其它 Linux 发行版 / Windows / macOS 安装命令
                                      </span>
                                    }
                                    itemKey="other-commands"
                                  >
                                    <div className="space-y-2 pt-2 text-xs">
                                      {Object.entries(tool.install_commands).map(([pmKey, cmd]) => (
                                        <div
                                          className="flex flex-col gap-1 rounded bg-muted/40 p-2 border border-border/30"
                                          key={pmKey}
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-semibold text-muted-foreground text-[11px]">
                                              {pmNames[pmKey] || pmKey}
                                            </span>
                                            <Button
                                              icon={<Copy className="size-2.5" />}
                                              onClick={() => handleCopy(cmd, `${tool.name} (${pmKey})`)}
                                              size="small"
                                              theme="borderless"
                                            >
                                              复制
                                            </Button>
                                          </div>
                                          <code className="font-mono text-[11px] break-all select-all text-foreground/90">
                                            {cmd}
                                          </code>
                                        </div>
                                      ))}
                                    </div>
                                  </Collapse.Panel>
                                </Collapse>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">暂无自动安装指令，请查阅对应数据库官方手册进行安装。</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </PageSection>
    </Page>
  )
}
