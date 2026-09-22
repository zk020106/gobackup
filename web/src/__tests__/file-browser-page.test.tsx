import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { downloadTicketMock } = vi.hoisted(() => ({ downloadTicketMock: vi.fn() }))

const filesResponse = [
  {
    filename: '2026.09.21.03.30.01.tar.gz',
    last_modified: '2026-09-21T03:30:05Z',
    size: 2048
  }
]

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ model: 'venus' })
}))

vi.mock('@/api/backup-queries', () => ({
  backupQueries: {
    files: () => ({
      queryFn: () => Promise.resolve(filesResponse),
      queryKey: ['gobackup', 'files', 'venus', '/']
    })
  }
}))

vi.mock('@/api/gobackup', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/gobackup')>()
  return {
    ...actual,
    gobackupApi: {
      ...actual.gobackupApi,
      downloadTicket: downloadTicketMock
    }
  }
})

const { default: FileBrowserPage } = await import('@/pages/file-browser-page')

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { refetchInterval: false, retry: false, staleTime: Infinity } }
  })

  return render(
    <QueryClientProvider client={client}>
      <FileBrowserPage />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  downloadTicketMock.mockReset()
  vi.restoreAllMocks()
})

/** 拦截 <a>.click()，记录浏览器被要求下载的地址。 */
function spyOnDownloads() {
  const opened: string[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    opened.push(this.href)
  })
  return opened
}

/**
 * 归档文件不能先用 fetch 读进内存再存盘，所以下载流程是：
 * 换一次性票据 → 让浏览器带着 ?ticket= 走原生下载。
 */
describe('file browser download', () => {
  it('先换票据再发起原生下载', async () => {
    downloadTicketMock.mockResolvedValue('ticket-123')
    const opened = spyOnDownloads()

    renderPage()

    const button = await screen.findByRole('button', { name: '下载' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(opened).toHaveLength(1)
    })

    expect(downloadTicketMock).toHaveBeenCalledWith('venus', '2026.09.21.03.30.01.tar.gz')
    const target = opened[0]
    expect(target).toContain('/api/download?')
    expect(target).toContain('model=venus')
    expect(target).toContain('path=2026.09.21.03.30.01.tar.gz')
    expect(target).toContain('ticket=ticket-123')
  })

  it('拿不到票据时给出错误提示且不跳转', async () => {
    downloadTicketMock.mockRejectedValue(new Error('HTTP 401'))
    const opened = spyOnDownloads()

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '下载' }))

    await waitFor(() => {
      expect(downloadTicketMock).toHaveBeenCalled()
    })
    expect(opened).toHaveLength(0)

    // 顺带验证 Semi 的命令式 Toast 真的能挂载（React 19 需要 react19-adapter）。
    expect(await screen.findByText('HTTP 401')).toBeInTheDocument()
  })
})
