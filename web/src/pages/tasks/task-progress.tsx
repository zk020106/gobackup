import { Button, Card, Progress, Tag } from '@douyinfe/semi-ui-19'
import { Download, Eye } from 'lucide-react'

import type { BackupRun } from '@/api/gobackup'
import { formatDateTime, statusLabel, triggerLabel } from '@/pages/logs/log-utils'
import {
  bytesText,
  phaseText,
  progressAriaLabel,
  progressPercent,
  progressText
} from '@/pages/tasks/task-utils'

/** 触发方式标签，与运行日志页保持一致的配色。 */
export function TaskTriggerTag({ trigger }: { trigger: string }) {
  const color = trigger === 'schedule' ? 'blue' : trigger === 'api' ? 'purple' : 'grey'

  return <Tag color={color} className="w-fit">{triggerLabel(trigger)}</Tag>
}

/** 任务状态标签：进行中的任务统一显示「进行中」，已结束的按结果着色。 */
export function TaskStatusTag({ run }: { run: BackupRun }) {
  if (run.running) {
    return <Tag color="orange" className="w-fit">进行中</Tag>
  }

  switch (run.status) {
    case 'success':
      return <Tag color="green" className="w-fit">成功</Tag>
    case 'failure':
      return <Tag color="red" className="w-fit">失败</Tag>
    case 'running':
      // 后端标记已结束但状态还停留在 running：按进行中展示，避免出现「假成功」。
      return <Tag color="orange" className="w-fit">进行中</Tag>
    default:
      return <Tag color="grey" className="w-fit">{statusLabel(run.status)}</Tag>
  }
}

export type TaskProgressPanelProps = {
  /** 后端给的实时进度，可能为空（任务刚创建时还没有进度点）。 */
  progress?: BackupRun['progress']
  /** 用于 aria 文案，便于读屏与测试定位到具体任务。 */
  model?: string
}

/**
 * 任务进度展示：进度条 + 阶段说明 + 字节计数。
 *
 * `indeterminate`（总量未知）时进度条以不确定动画呈现，右侧文案固定为「进行中」，
 * 只保留阶段与字节信息，避免把阶段百分比当成整体进度误导用户。
 */
export function TaskProgressPanel({ model, progress }: TaskProgressPanelProps) {
  const percent = progressPercent(progress)
  const indeterminate = percent === undefined
  const bytes = bytesText(progress)
  const phase = phaseText(progress)
  // 阶段百分比只在有意义（已知总量且未走完）时补充展示。
  const phasePercent =
    !indeterminate && progress && progress.phase_percent > 0 && progress.phase_percent < 100
      ? Math.round(progress.phase_percent)
      : undefined

  return (
    <div className="grid gap-1.5">
      <Progress
        aria-label={progressAriaLabel(progress, model)}
        format={() => progressText(progress)}
        indeterminate={indeterminate}
        percent={percent ?? 0}
        showInfo
        stroke="var(--semi-color-primary)"
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {phase ? <span className="min-w-0 break-all">{phase}</span> : null}
        {phasePercent !== undefined ? (
          <span className="whitespace-nowrap">阶段 {phasePercent}%</span>
        ) : null}
        {bytes ? <span className="whitespace-nowrap">{bytes}</span> : null}
      </div>
    </div>
  )
}

export type LiveTaskCardProps = {
  /** 已经格式化好的运行时长，由页面每秒重算，保证卡片里的耗时在跳动。 */
  elapsedText: string
  run: BackupRun
  onDownload: (run: BackupRun) => void
  onOpenLog: (run: BackupRun) => void
}

/** 进行中任务的卡片：一眼能看出「哪个模型、跑了多久、卡在哪一步」。 */
export function LiveTaskCard({ elapsedText, onDownload, onOpenLog, run }: LiveTaskCardProps) {
  const progress = run.progress

  return (
    <Card
      headerExtraContent={
        <div className="flex items-center gap-2">
          <TaskTriggerTag trigger={run.trigger} />
          <TaskStatusTag run={run} />
        </div>
      }
      shadows="hover"
      title={<span className="font-semibold uppercase">{run.model}</span>}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>开始于 {formatDateTime(run.started_at)}</span>
          <span className="text-sm font-medium text-foreground">已运行 {elapsedText}</span>
          {progress?.updated_at ? (
            <span>进度更新 {formatDateTime(progress.updated_at)}</span>
          ) : null}
        </div>

        <TaskProgressPanel model={run.model} progress={progress} />

        {!progress ? <div className="text-xs text-muted-foreground">正在启动备份任务…</div> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<Eye className="size-4" />}
            onClick={() => onOpenLog(run)}
            theme="solid"
            type="primary"
          >
            查看日志
          </Button>
          <Button
            icon={<Download className="size-4" />}
            onClick={() => onDownload(run)}
            theme="light"
            type="tertiary"
          >
            下载日志
          </Button>
        </div>
      </div>
    </Card>
  )
}
