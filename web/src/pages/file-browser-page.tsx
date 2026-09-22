import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Empty, Skeleton, Tag, Toast } from '@douyinfe/semi-ui-19'
import { ArrowLeft, Download, FileArchive, RefreshCw } from 'lucide-react'

import { backupQueries } from '@/api/backup-queries'
import { buildBackupUrl, gobackupApi } from '@/api/gobackup'
import { Page, PageSection } from '@/components/page'

function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = -1

  do {
    size /= 1024
    unit += 1
  } while (size >= 1024 && unit < units.length - 1)

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`
}

function decodeModel(value: unknown) {
  if (typeof value !== 'string') return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * 用浏览器原生方式触发下载。
 *
 * 不用 location.assign 是为了避免某些浏览器把整个响应当成一次「导航」，
 * 也不用 download 属性：本地存储由后端发 Content-Disposition 决定文件名，
 * 远端存储则会 302 到跨域的预签名地址，download 属性对它没有意义。
 */
function startNativeDownload(url: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export default function FileBrowserPage() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { model?: string }
  const model = decodeModel(params.model)
  const [parent, setParent] = useState('/')
  const [pending, setPending] = useState('')
  const { data: files = [], isError, isLoading, refetch } = useQuery(backupQueries.files(model, parent))

  useEffect(() => {
    setParent('/')
  }, [model])

  // 归档可能很大，所以不用 fetch + blob（那会把整个文件读进内存），而是先换一张
  // 一次性票据，再让浏览器带着 ?ticket= 发起原生下载：既支持流式写盘，也能正确
  // 跟随远端存储的 302 预签名跳转。
  const handleDownload = async (fileKey: string) => {
    setPending(fileKey)
    try {
      const ticket = await gobackupApi.downloadTicket(model, fileKey)
      if (!ticket) {
        throw new Error('未能获取下载票据')
      }
      startNativeDownload(buildBackupUrl('download', { model, path: fileKey, ticket }))
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '下载失败')
    } finally {
      setPending('')
    }
  }

  return (
    <Page
      actions={
        <div className="flex gap-2">
          <Button
            icon={<ArrowLeft className="size-4" />}
            onClick={() => void navigate({ to: '/overview' })}
            theme="light"
            type="tertiary"
          >
            返回概览
          </Button>
          <Button
            icon={<RefreshCw className="size-4" />}
            loading={isLoading}
            onClick={() => void refetch()}
            theme="light"
            type="tertiary"
          >
            刷新
          </Button>
        </div>
      }
      description={`浏览 ${model || '未知模型'} 的默认存储归档。`}
      title="文件浏览"
    >
      <PageSection>
        <Card
          headerExtraContent={<Tag color="blue">{parent}</Tag>}
          shadows="hover"
          title={<span className="uppercase">{model || '未知模型'}</span>}
        >
          {isError ? (
            <div className="py-12 text-center text-sm text-destructive">无法读取归档文件，请检查模型配置和存储连接。</div>
          ) : isLoading ? (
            <Skeleton active />
          ) : files.length === 0 ? (
            <Empty description="当前目录没有归档文件" />
          ) : (
            <div className="divide-y divide-border">
              {files.map(file => {
                // list 接口返回的是相对 parent 的文件名，拼回完整的存储路径才能下载。
                const fileKey = parent === '/' ? file.filename : `${parent.replace(/\/+$/, '')}/${file.filename}`
                const modified = file.last_modified ? new Date(file.last_modified).toLocaleString() : '-'

                return (
                  <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between" key={`${file.filename}-${file.last_modified}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <FileArchive className="size-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <button
                          className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                          onClick={() => void handleDownload(fileKey)}
                          type="button"
                        >
                          {file.filename}
                        </button>
                        <div className="mt-1 text-xs text-muted-foreground">{modified}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-8 text-xs text-muted-foreground md:pl-0">
                      <span>{formatBytes(file.size)}</span>
                      <Button
                        icon={<Download className="size-4" />}
                        loading={pending === fileKey}
                        onClick={() => void handleDownload(fileKey)}
                        size="small"
                        theme="light"
                        type="tertiary"
                      >
                        下载
                      </Button>
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
