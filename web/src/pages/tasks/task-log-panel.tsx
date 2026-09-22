import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LazyLog, type LazyLogProps } from '@melloware/react-logviewer'
import { Button, Empty, Tag, Toast } from '@douyinfe/semi-ui-19'
import { ArrowDownToLine, ArrowUpToLine, Download, RefreshCw } from 'lucide-react'

import { authorizedFetch, buildStreamUrl } from '@/api/stream'
import { downloadRemoteFile } from '@/pages/logs/log-utils'
import { taskLogDownloadUrl, taskLogStreamUrl } from '@/pages/tasks/task-utils'

type StreamStatus = 'connecting' | 'streaming' | 'ended' | 'error'
type LogScrollArgs = Parameters<NonNullable<LazyLogProps['onScroll']>>[0]

type LiveTaskLogPanelProps = {
  /** 任务是否仍在进行；父组件由任务列表轮询结果推导，流式日志据此收尾。 */
  active: boolean
  /** 任务结束时通知父组件，父组件只记录状态，不触发重新请求。 */
  onActiveChange?: (active: boolean) => void
  /** 运行记录 id。 */
  taskId: string
}

/** 前端保留的日志行数上限，避免长时间挂着连接占用内存。 */
const maxBufferedLines = 5000
/** 日志批量刷新间隔：每来一行都 setState 会让长日志页面卡顿。 */
const flushInterval = 200

/** LazyLog 搜索栏中文文案。 */
const logViewerTexts: LazyLogProps['internacionalization'] = {
  searchBar: {
    filterLinesTitle: '仅显示匹配行',
    matchLabel: '条匹配',
    matchesLabel: '条匹配',
    nextButtonTitle: '下一处匹配',
    previousButtonTitle: '上一处匹配',
    searchPlaceholder: '搜索日志内容'
  }
}

/** 判定“已滚到底部”时允许的像素误差，避免亚像素滚动距离让自动跟随状态抖动。 */
const bottomTolerance = 4
/** 新数据写入后忽略滚动事件的时长，避免 LazyLog 程序化滚动被误判为用户手动操作。 */
const scrollSettleWindow = 300

function statusTag(status: StreamStatus) {
  switch (status) {
    case 'connecting':
      return <Tag color="orange">连接中</Tag>
    case 'streaming':
      return <Tag color="green">实时</Tag>
    case 'ended':
      return <Tag color="grey">已结束</Tag>
    case 'error':
      return <Tag color="red">已断开</Tag>
  }
}

/** 向下找到真正的虚拟列表滚动容器。 */
function findScrollable(root: HTMLElement): HTMLElement | undefined {
  let best: HTMLElement | undefined

  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue
    if (child.scrollHeight > child.clientHeight + 1) best = child
    const nested = findScrollable(child)
    if (nested && (!best || nested.scrollHeight > best.scrollHeight)) best = nested
  }

  return best
}

/**
 * 单个任务的实时日志面板。
 *
 * 用 `authorizedFetch` + `ReadableStream` 跟随 `/api/runs/:id/log/stream`：
 * 日志行可能被拆到多个 chunk，所以用 `TextDecoder(stream: true)` 解码并保留
 * 未完成的最后一行；空行是服务端心跳，直接丢弃。
 */
export default function LiveTaskLogPanel({
  active,
  onActiveChange,
  taskId
}: LiveTaskLogPanelProps) {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [error, setError] = useState<string>()
  const [reloadKey, setReloadKey] = useState(0)
  // 进行中的任务初始跟随最新输出；已结束的历史任务初始停留在顶部第 1 行，不自动沉底。
  const [follow, setFollow] = useState(active)

  const bufferRef = useRef<string[]>([])
  const flushTimerRef = useRef<number | undefined>(undefined)
  const activeRef = useRef(active)
  const onActiveChangeRef = useRef(onActiveChange)
  // 已读取到的字节偏移：连接被服务端收尾后重连时带上 offset 续读，避免重复整段日志。
  const offsetRef = useRef(0)
  /** 最近一次把新数据写入 state 的时间戳。 */
  const lastAppendAtRef = useRef(0)
  /** 日志滚动容器的真实 DOM，用于“跳到最新”与“回到顶部”。 */
  const viewportRef = useRef<HTMLDivElement | null>(null)

  activeRef.current = active
  onActiveChangeRef.current = onActiveChange

  useEffect(() => {
    // 任务切换或重连时，根据当前任务是否仍在运行初始化跟随状态
    setFollow(active)
  }, [taskId, active])

  useEffect(() => {
    const controller = new AbortController()
    // 单次连接最多续读 3 次，避免服务端异常时无限重连。
    const maxRetries = 3
    let closed = false
    let remainder = ''
    let retries = 0
    let retryTimer: number | undefined

    function flush() {
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = undefined
      }
      const pending = bufferRef.current
      if (pending.length === 0) return
      bufferRef.current = []
      lastAppendAtRef.current = Date.now()
      setLines(previous => {
        const next = previous.concat(pending)
        return next.length > maxBufferedLines ? next.slice(next.length - maxBufferedLines) : next
      })
    }

    function scheduleFlush() {
      if (flushTimerRef.current !== undefined) return
      flushTimerRef.current = window.setTimeout(flush, flushInterval)
    }

    /** 连接在任务未结束时断开：带 offset 续读，最多重试 3 次。 */
    function scheduleRetry() {
      if (retries >= maxRetries) {
        setStatus('error')
        setError('日志流多次中断，请点击「重新连接」继续跟随')
        return
      }
      retries += 1
      const delay = 1000 * 2 ** (retries - 1)
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined
        void readStream()
      }, delay)
    }

    async function readStream() {
      try {
        // offset > 0 表示续读；否则回放最后 200 行。
        const url =
          offsetRef.current > 0
            ? buildStreamUrl(`runs/${encodeURIComponent(taskId)}/log/stream`, {
                offset: offsetRef.current
              })
            : taskLogStreamUrl(taskId, 200)
        const response = await authorizedFetch(url, { signal: controller.signal })
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`)
        }

        setError(undefined)
        setStatus('streaming')

        // 响应头里的 X-Run-Running 表示连接建立时任务是否仍在运行。
        if (response.headers.get('X-Run-Running') === 'false') {
          activeRef.current = false
          onActiveChangeRef.current?.(false)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            offsetRef.current += value.byteLength
            const chunk = remainder + decoder.decode(value, { stream: true })
            const parts = chunk.split('\n')
            remainder = parts.pop() ?? ''
            // 空行是服务端心跳，丢弃；其余按行入缓冲。
            bufferRef.current.push(...parts.filter(line => line.trim() !== ''))
            scheduleFlush()
          }
          // 注意：这里不能因为任务状态变成已结束就 break。任务收尾时
          // 服务端还会补发最后几行（结束状态、耗时），提前跳出会丢掉它们；
          // 服务端在写完剩余内容后会自己关闭流。
        }

        if (closed) return
        flush()
        if (activeRef.current) {
          // 任务还在跑却断了（网络抖动 / 代理超时），续读而不是直接报错。
          setStatus('connecting')
          scheduleRetry()
        } else {
          setStatus('ended')
        }
      } catch (caught) {
        if (closed || controller.signal.aborted) return
        flush()
        const message = caught instanceof Error ? caught.message : '无法读取任务日志'
        setError(message)
        setStatus('error')
        Toast.error(`任务日志连接失败：${message}`)
      }
    }

    setLines([])
    bufferRef.current = []
    setStatus('connecting')
    setError(undefined)
    void readStream()

    return () => {
      closed = true
      controller.abort()
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer)
        retryTimer = undefined
      }
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = undefined
      }
    }
  }, [taskId, reloadKey])

  const text = useMemo(() => lines.join('\n'), [lines])

  /**
   * 仅把用户真实滚动当作改变自动跟随的依据。
   * 新数据写入后的 `scrollSettleWindow` 毫秒内忽略程序化滚动事件。
   */
  function handleLogScroll({ clientHeight, scrollHeight, scrollTop }: LogScrollArgs) {
    if (Date.now() - lastAppendAtRef.current < scrollSettleWindow) return
    if (scrollHeight <= clientHeight) return
    const atBottom = scrollHeight - scrollTop - clientHeight <= bottomTolerance
    setFollow(previous => (previous === atBottom ? previous : atBottom))
  }

  function jumpToLatest() {
    setFollow(true)
    const container = viewportRef.current
    const scrollable = container ? findScrollable(container) : undefined
    if (scrollable) {
      scrollable.scrollTop = scrollable.scrollHeight
    }
  }

  function jumpToTop() {
    setFollow(false)
    const container = viewportRef.current
    const scrollable = container ? findScrollable(container) : undefined
    if (scrollable) {
      scrollable.scrollTop = 0
    }
  }

  const reconnect = useCallback(() => {
    // 手动重连从头回放最近的行，offset 归零。
    offsetRef.current = 0
    setFollow(activeRef.current)
    setReloadKey(value => value + 1)
  }, [])

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {statusTag(status)}
          {active ? (
            follow ? (
              <Tag color="green">自动跟随</Tag>
            ) : (
              <Tag color="grey">已暂停跟随</Tag>
            )
          ) : null}
          <Tag color="blue">{lines.length} 行</Tag>
          {status === 'ended' && !error ? (
            <span className="text-xs text-muted-foreground">任务已结束，已保留全部接收到的日志。</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<ArrowUpToLine className="size-4" />}
            onClick={jumpToTop}
            size="small"
            theme="light"
            type="tertiary"
          >
            回到顶部
          </Button>
          <Button
            icon={<ArrowDownToLine className="size-4" />}
            onClick={jumpToLatest}
            size="small"
            theme="light"
            type="tertiary"
          >
            跳到最新
          </Button>
          <Button
            icon={<RefreshCw className="size-4" />}
            onClick={reconnect}
            size="small"
            theme="light"
            type="tertiary"
          >
            重新连接
          </Button>
        </div>
      </div>

      {error ? (
        <div
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive md:flex-row md:items-center md:justify-between"
          role="alert"
        >
          <span className="min-w-0 break-all">读取任务日志失败：{error}</span>
          <Button
            icon={<RefreshCw className="size-4" />}
            onClick={reconnect}
            size="small"
            theme="light"
            type="danger"
          >
            重试
          </Button>
        </div>
      ) : null}

      <div
        className="h-[46vh] min-h-64 overflow-hidden rounded-lg bg-[#222222]"
        ref={viewportRef}
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Empty
              description={
                status === 'connecting'
                  ? '正在连接任务日志…'
                  : status === 'ended'
                    ? '该任务没有产生日志输出'
                    : '暂无日志输出'
              }
            />
          </div>
        ) : (
          <LazyLog
            enableLineNumbers
            enableLinks
            enableSearch
            extraLines={1}
            follow={follow}
            height="auto"
            internacionalization={logViewerTexts}
            onScroll={handleLogScroll}
            selectableLines
            text={text}
            wrapLines
          />
        )}
      </div>
    </div>
  )
}

/** 日志面板底部的下载按钮，统一处理下载失败提示。 */
export function TaskLogDownloadButton({ taskId }: { taskId: string }) {
  const [downloading, setDownloading] = useState(false)

  async function download() {
    setDownloading(true)
    try {
      await downloadRemoteFile(taskLogDownloadUrl(taskId), `${taskId}.log`)
    } catch (caught) {
      Toast.error(caught instanceof Error ? caught.message : '下载任务日志失败')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button
      icon={<Download className="size-4" />}
      loading={downloading}
      onClick={() => void download()}
      theme="light"
      type="tertiary"
    >
      下载日志
    </Button>
  )
}
