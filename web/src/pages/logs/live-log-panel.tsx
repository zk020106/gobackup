import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LazyLog, type LazyLogProps } from '@melloware/react-logviewer'
import { Button, Card, Empty, Input, Select, Tag, Toast } from '@douyinfe/semi-ui-19'
import {
  ArrowDownToLine,
  Download,
  Eraser,
  RefreshCw,
  Search,
  WrapText
} from 'lucide-react'

import { buildBackupUrl } from '@/api/gobackup'
import { authorizedFetch, buildStreamUrl } from '@/api/stream'
import { PageSection } from '@/components/page'
import {
  detectLogLevel,
  downloadRemoteFile,
  filterLogLines,
  logLevelClassName,
  splitLogChunk,
  type LogLevelFilter
} from '@/pages/logs/log-utils'

type LogScrollArgs = Parameters<NonNullable<LazyLogProps['onScroll']>>[0]
type ConnectionStatus = 'connecting' | 'streaming' | 'retrying' | 'error'

/** 前端保留的日志行数上限，避免长时间打开页面占用过多内存。 */
const maxBufferedLines = 5000
/** 日志批量刷新的间隔，避免每来一行都触发一次 React 渲染。 */
const flushInterval = 200
/**
 * 首次连接只回看末尾这么多行。
 *
 * 不能直接读整个日志文件：日志动辄几十万行，一次性渲染会把浏览器卡死，
 * 页面看起来就像「一直没有渲染」。跟随的新增内容是逐块追加的，不受此限制。
 */
const tailLines = 200

/** 重连退避：1s → 2s → 5s → 10s（封顶），成功收到数据后回到 1s。 */
const retryDelays = [1000, 2000, 5000, 10000]

/** 判定“已滚到底部”时允许的像素误差，避免亚像素滚动距离让自动跟随状态抖动。 */
const bottomTolerance = 4
/**
 * 新数据写入后忽略滚动事件的时长。
 *
 * LazyLog 会自己把视口滚到底部，这个程序化滚动常常停在离底部几个像素的位置，
 * 若直接据此判断，用户会看到「自动跟随」莫名其妙被关掉。只有这段时间窗之外
 * 的滚动才算用户真实操作。
 */
const scrollSettleWindow = 300

/** LazyLog 搜索栏中文文案，库只支持通过 `internacionalization.searchBar` 覆盖这些字符串。 */
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

const levelOptions = [
  { label: '全部等级', value: 'all' },
  { label: '错误', value: 'error' },
  { label: '警告', value: 'warn' },
  { label: '信息', value: 'info' },
  { label: '调试', value: 'debug' }
]

function statusTag(status: ConnectionStatus) {
  switch (status) {
    case 'connecting':
      return <Tag color="orange">连接中</Tag>
    case 'streaming':
      return <Tag color="green">实时</Tag>
    case 'retrying':
      return <Tag color="orange">重连中</Tag>
    case 'error':
      return <Tag color="red">已断开</Tag>
  }
}

/**
 * 向下找到真正的滚动容器。
 *
 * LazyLog 用 virtua 渲染虚拟列表，可滚动元素在组件内部，外层容器是
 * `overflow-hidden`，所以“跳到最新”要找到子孙节点里内容最高的那个。
 */
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

export default function LiveLogPanel() {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<string>()
  const [level, setLevel] = useState<LogLevelFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [follow, setFollow] = useState(true)
  const [wrapLines, setWrapLines] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [downloading, setDownloading] = useState(false)

  /** 已解析但还没写入 state 的日志行。 */
  const bufferRef = useRef<string[]>([])
  const flushTimerRef = useRef<number | undefined>(undefined)
  /** 下一次连接续读的字节偏移量，避免重连后从头重放。 */
  const offsetRef = useRef(0)
  /** 重连定时器。 */
  const retryTimerRef = useRef<number | undefined>(undefined)
  /** 当前重连退避档位。 */
  const retryIndexRef = useRef(0)
  /** 最近一次把新数据写入 state 的时间戳。 */
  const lastAppendAtRef = useRef(0)
  /** 日志滚动容器的真实 DOM，用于“跳到最新”。 */
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const logUrl = buildStreamUrl('log', { tail: tailLines, follow: 1 })

  useEffect(() => {
    const controller = new AbortController()
    let remainder = ''
    // 本连接已收到的字节数；剩余内容（不满一行）不算已完成，续读时从行首开始。
    let receivedBytes = 0
    let delivered = false

    /** 把缓冲的日志行批量写入 state，避免每来一行都触发一次渲染。 */
    function flushPending() {
      flushTimerRef.current = undefined
      const pending = bufferRef.current
      if (pending.length === 0) return
      bufferRef.current = []
      lastAppendAtRef.current = Date.now()
      setLines(previous => {
        const next = previous.concat(pending)
        return next.length > maxBufferedLines ? next.slice(next.length - maxBufferedLines) : next
      })
      // 注意：这里不要动 follow。日志持续输出时每 200ms 都会走到这里，若在这里
      // 恢复自动跟随，用户向上翻阅历史会被立刻拽回底部，「已暂停跟随」再也点不住。
      // 恢复跟随只由「跳到最新」「重新连接」这类明确的用户操作触发。
    }

    function scheduleFlush() {
      if (flushTimerRef.current !== undefined) return
      flushTimerRef.current = window.setTimeout(flushPending, flushInterval)
    }

    function cancelRetry() {
      if (retryTimerRef.current !== undefined) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = undefined
      }
    }

    /**
     * 流结束或出错后自动重连：组件仍挂载时按退避表重试，不再让页面停在
     * 「已断开」上等用户手动点重新连接。手动重连（reloadKey 变化）会清掉旧定时器。
     */
    function scheduleRetry() {
      if (controller.signal.aborted) return
      cancelRetry()
      const delay = retryDelays[Math.min(retryIndexRef.current, retryDelays.length - 1)]
      retryIndexRef.current += 1
      setStatus('retrying')
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = undefined
        if (controller.signal.aborted) return
        void connect()
      }, delay)
    }

    /** 失败提示：401 说明登录态失效，其余状态码按 HTTP 展示。 */
    function reportFailure(caught: unknown) {
      const failure = caught as { status?: number; message?: string } | undefined
      const status = failure?.status
      const message =
        status === 401
          ? '登录状态已失效，请重新登录后再查看实时日志'
          : status !== undefined
            ? `HTTP ${status}`
            : (failure?.message ?? '无法读取运行日志')
      setStatus('error')
      setError(message)
      Toast.error(`日志连接失败：${message}`)
    }

    async function connect() {
      setStatus('connecting')
      setError(undefined)

      // 无论正常结束还是失败，只要组件还在挂载就自动重连（退避 1s 起）。
      try {
        const streamUrl = buildStreamUrl('log', {
          tail: offsetRef.current > 0 ? 0 : tailLines,
          offset: offsetRef.current,
          follow: 1
        })
        const response = await authorizedFetch(streamUrl, { signal: controller.signal })

        if (!response.ok || !response.body) {
          const failure = new Error(`HTTP ${response.status}`) as Error & { status: number }
          failure.status = response.status
          throw failure
        }

        setStatus('streaming')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          // 先按“流式”解码，保证被切开的 UTF-8 多字节字符不会变成乱码。
          const chunk = splitLogChunk(remainder + decoder.decode(value, { stream: true }))
          remainder = chunk.remainder
          receivedBytes += value.byteLength
          if (chunk.lines.length > 0) {
            bufferRef.current = bufferRef.current.concat(chunk.lines)
            scheduleFlush()
          }
          // 收到过数据说明连接是好的，退避重新从 1s 开始。
          if (!delivered) {
            delivered = true
            retryIndexRef.current = 0
          }
        }

        if (!controller.signal.aborted) {
          // 流被服务端或代理正常切断：保留已收到的内容，记录续读位置。
          flushPending()
          // 续读位置 = 已收到字节数去掉当前这半行还没结束的内容。
          offsetRef.current = Math.max(0, receivedBytes - new TextEncoder().encode(remainder).length)
          setError(undefined)
        }
      } catch (caught) {
        if (controller.signal.aborted) return
        flushPending()
        reportFailure(caught)
      } finally {
        scheduleRetry()
      }
    }

    /** 每次连接开始时重置重连退避。 */
    retryIndexRef.current = 0
    void connect()

    return () => {
      controller.abort()
      cancelRetry()
      if (flushTimerRef.current !== undefined) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = undefined
      }
      bufferRef.current = []
    }
  }, [logUrl, reloadKey])

  const visibleLines = useMemo(
    () => filterLogLines(lines, level, keyword),
    [lines, level, keyword]
  )
  const text = useMemo(() => visibleLines.join('\n'), [visibleLines])

  /**
   * 只把用户真实滚动当作暂停跟随的依据。
   *
   * 新数据写入后的 `scrollSettleWindow` 毫秒内，LazyLog 的程序化滚动（以及
   * 列表高度变化带来的滚动事件）全部忽略，避免自动跟随被误关。
   */
  function handleLogScroll({ clientHeight, scrollHeight, scrollTop }: LogScrollArgs) {
    if (Date.now() - lastAppendAtRef.current < scrollSettleWindow) return
    if (scrollHeight <= clientHeight) return
    const atBottom = scrollHeight - scrollTop - clientHeight <= bottomTolerance
    setFollow(previous => (previous === atBottom ? previous : atBottom))
  }

  function reconnect() {
    bufferRef.current = []
    setFollow(true)
    setReloadKey(value => value + 1)
  }

  /** 跳到最新：恢复自动跟随，并把虚拟列表滚到底部（只把 follow 置为 true 不会立刻滚动）。 */
  function jumpToLatest() {
    setFollow(true)
    const container = viewportRef.current
    const scrollable = container ? findScrollable(container) : undefined
    if (scrollable) {
      scrollable.scrollTop = scrollable.scrollHeight
    }
  }

  function clearBuffer() {
    bufferRef.current = []
    setLines([])
    Toast.info('已清空当前页面的日志缓存，服务端日志不受影响')
  }

  async function downloadLog() {
    setDownloading(true)
    try {
      await downloadRemoteFile(buildBackupUrl('log/download'), 'gobackup.log')
    } catch (caught) {
      Toast.error(caught instanceof Error ? caught.message : '下载日志失败')
    } finally {
      setDownloading(false)
    }
  }

  /**
   * 整行着色：我们没有开启 ANSI 高亮，一行就是一个 part，所以这里直接按行
   * 判断等级——error 红 / warn 琥珀 / debug 灰 / info 保持默认颜色。
   */
  function highlightPart(part: string): ReactNode {
    const className = logLevelClassName(detectLogLevel(part))
    return className ? <span className={className}>{part}</span> : part
  }

  return (
    <PageSection contentClassName="grid gap-3">
      {error ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive md:flex-row md:items-center md:justify-between"
          role="alert"
        >
          <span className="min-w-0 break-all">日志连接失败：{error}</span>
          <Button
            icon={<RefreshCw className="size-4" />}
            onClick={reconnect}
            theme="light"
            type="danger"
          >
            重试
          </Button>
        </div>
      ) : null}

      <Card
        headerExtraContent={
          <div className="flex flex-wrap items-center gap-2">
            {statusTag(status)}
            {follow ? <Tag color="green">自动跟随</Tag> : <Tag color="grey">已暂停跟随</Tag>}
            <Tag color="blue">
              {visibleLines.length === lines.length
                ? `共 ${lines.length} 行`
                : `共 ${lines.length} 行 / 显示 ${visibleLines.length} 行`}
            </Tag>
            <span className="text-xs text-muted-foreground">tail={tailLines}</span>
          </div>
        }
        shadows="hover"
        title="服务输出"
      >
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-32"
              optionList={levelOptions}
              value={level}
              onChange={next => setLevel(next as LogLevelFilter)}
            />
            <Input
              className="min-w-48 flex-1"
              placeholder="按关键词过滤，例如 venus / failed"
              prefix={<Search className="size-4 text-muted-foreground" />}
              showClear
              value={keyword}
              onChange={setKeyword}
            />
            <Button
              aria-pressed={wrapLines}
              icon={<WrapText className="size-4" />}
              onClick={() => setWrapLines(value => !value)}
              theme={wrapLines ? 'solid' : 'light'}
              type="tertiary"
            >
              折行
            </Button>
            <Button
              icon={<ArrowDownToLine className="size-4" />}
              onClick={jumpToLatest}
              theme="light"
              type="tertiary"
            >
              跳到最新
            </Button>
            <Button
              icon={<Eraser className="size-4" />}
              onClick={clearBuffer}
              theme="light"
              type="tertiary"
            >
              清屏
            </Button>
            <Button
              icon={<Download className="size-4" />}
              loading={downloading}
              onClick={() => void downloadLog()}
              theme="light"
              type="tertiary"
            >
              下载
            </Button>
            <Button
              icon={<RefreshCw className="size-4" />}
              onClick={reconnect}
              theme="light"
              type="tertiary"
            >
              重新连接
            </Button>
          </div>

          {/*
            外层固定高度：LazyLog 的 `height="auto"` 会按容器高度计算虚拟列表高度，
            背景色与库内置终端底色一致，未收到日志时也不会塌成空白。
          */}
          <div
            className="h-[calc(100vh-250px)] min-h-80 overflow-hidden rounded-lg bg-[#222222]"
            ref={viewportRef}
          >
            {visibleLines.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Empty
                  description={
                    lines.length === 0
                      ? status === 'connecting'
                        ? '正在连接日志流…'
                        : '暂无日志输出'
                      : '当前过滤条件下没有日志行'
                  }
                />
              </div>
            ) : (
              <LazyLog
                enableLineNumbers
                enableLinks
                enableSearch
                enableSearchNavigation
                extraLines={1}
                follow={follow}
                formatPart={highlightPart}
                height="auto"
                internacionalization={logViewerTexts}
                onScroll={handleLogScroll}
                selectableLines
                text={text}
                wrapLines={wrapLines}
              />
            )}
          </div>
        </div>
      </Card>
    </PageSection>
  )
}
