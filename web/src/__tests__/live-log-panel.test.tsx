import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import LiveLogPanel from '@/pages/logs/live-log-panel'
import { authStore } from '@/store/auth'
import type { AuthSession } from '@/types/auth'

/** 每个分片之间的间隔（毫秒）。 */
const chunkInterval = 50

/**
 * 按固定间隔投递分片的流。
 *
 * `pull` 不返回内容时 Node 的 ReadableStream 不会再次主动拉取，所以这里让
 * `pull` 返回 promise，保证每个分片都确实送达、节奏可预期。
 *
 * jsdom 没有布局，LazyLog（virtua 虚拟列表）不会渲染任何行，所以组件测试只
 * 断言可靠的部分：行数计数器、连接状态标签、错误提示，以及 fetch 收到的
 * URL / 请求头。日志行的解析由 log-utils 的单元测试覆盖。
 */
function createChunkedStream(chunks: string[]) {
  let index = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close()
        return
      }

      await new Promise(resolve => setTimeout(resolve, chunkInterval))
      controller.enqueue(new TextEncoder().encode(chunks[index]))
      index += 1
    }
  })
}

function okResponse(chunks: string[]) {
  return new Response(createChunkedStream(chunks), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    status: 200
  })
}

/** 行数计数器节点的文案；Semi 的 Tag 文案会拆成多个文本节点，直接读 DOM 最稳。 */
function counterText() {
  return document.querySelector('.semi-tag[aria-label^="Tag: 共"]')?.textContent?.trim()
}

async function waitForCounter(expected: string) {
  await waitFor(() => expect(counterText()).toBe(expected), { timeout: 4000 })
}

function setToken(token: string) {
  const session: AuthSession = {
    accessToken: token,
    user: { id: 'tester', name: 'Tester', permissions: [], roles: [] }
  }
  authStore.getState().setSession(session)
}

function fetchCalls() {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
  return fetchMock.mock.calls.map(call => ({
    headers: call[1]?.headers as Headers | undefined,
    url: String(call[0])
  }))
}

describe('LiveLogPanel 数据管道', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    authStore.getState().clearSession()
    window.localStorage.clear()
  })

  it('按换行拼接跨分片的日志行', async () => {
    // “second” 与 “ line” 分属两个分片，必须拼成同一行。
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(okResponse(['first line\nsecond', ' line\n'])))
    )

    render(<LiveLogPanel />)

    await waitForCounter('共 2 行')
    expect(await screen.findByText('实时')).toBeInTheDocument()
  })

  it('丢弃空行心跳，不把它算成日志行', async () => {
    // 第一片只有心跳空行，第二片才有真实日志行：行数只能是 1。
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(okResponse(['\n', 'real line\n'])))
    )

    render(<LiveLogPanel />)

    await waitForCounter('共 1 行')
  })

  it('用 authorizedFetch 带上 tail / offset / follow 与 Bearer token', async () => {
    setToken('stream-token')
    const fetchMock = vi.fn(() => Promise.resolve(okResponse(['boot\n'])))
    vi.stubGlobal('fetch', fetchMock)

    render(<LiveLogPanel />)

    await waitForCounter('共 1 行')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [call] = fetchCalls()
    // offset=0 也显式带上：后端只在 offset>0 时按偏移续读，否则回看 tail 行。
    expect(call.url).toBe('/api/log?tail=200&offset=0&follow=1')
    expect(call.headers?.get('Authorization')).toBe('Bearer stream-token')
  })

  it('HTTP 401 提示登录态失效', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('unauthorized', { status: 401 })))
    )

    render(<LiveLogPanel />)

    expect(
      await screen.findByText(
        '日志连接失败：登录状态已失效，请重新登录后再查看实时日志',
        undefined,
        { timeout: 4000 }
      )
    ).toBeInTheDocument()
    // 401 之后仍会自动重连，状态标签会从 已断开 切到 重连中，所以只断言必然
    // 存在的失败横幅与重试按钮。
    expect(await screen.findByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('其他状态码按 HTTP <status> 提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('boom', { status: 503 })))
    )

    render(<LiveLogPanel />)

    expect(
      await screen.findByText('日志连接失败：HTTP 503', undefined, { timeout: 4000 })
    ).toBeInTheDocument()
  })

  it('流结束后进入重连状态，并按字节偏移续读而不是从头重放', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okResponse(['abc\ndef\n'])))
    vi.stubGlobal('fetch', fetchMock)

    render(<LiveLogPanel />)

    await waitForCounter('共 2 行')
    // 第一次连接结束后自动重连（1s 退避），第二次请求改为按偏移续读。
    expect(await screen.findByText('重连中', undefined, { timeout: 4000 })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 4000 })

    expect(fetchCalls()[1].url).toBe('/api/log?tail=0&offset=8&follow=1')
  })

  it('关键词过滤只影响显示行数，计数器仍报告总数', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(okResponse(['[error] mysqldump failed\n[debug] args\n'])))
    )

    render(<LiveLogPanel />)

    await waitForCounter('共 2 行')

    const input = screen.getByPlaceholderText('按关键词过滤，例如 venus / failed')
    fireEvent.change(input, { target: { value: 'mysqldump' } })

    await waitForCounter('共 2 行 / 显示 1 行')
  })
})
