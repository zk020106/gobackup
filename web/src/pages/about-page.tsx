import { useQuery } from '@tanstack/react-query'
import { Card, Skeleton, Tag } from '@douyinfe/semi-ui-19'
import { ExternalLink, GitBranch, Heart, ServerCog } from 'lucide-react'
import { projectInfo } from 'virtual:admin-project-info'

import { gobackupApi } from '@/api/gobackup'
import { Page, PageSection } from '@/components/page'

const repositoryURL =
  projectInfo.meta.find(item => item.label === '仓库')?.href ?? 'https://github.com/zk020106/gobackup'
const buildTime = projectInfo.meta.find(item => item.label === '最后构建时间')?.value ?? '-'

export default function AboutPage() {
  const statusQuery = useQuery({
    queryKey: ['gobackup', 'status'],
    queryFn: ({ signal }) => gobackupApi.status(signal),
    retry: false
  })

  return (
    <Page
      description="当前仓库的 GoBackup Web 管理界面，直接对接后端服务，不包含任何 mock 数据。"
      title="关于 GoBackup"
    >
      <PageSection contentClassName="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card shadows="hover" title="项目简介">
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              GoBackup 是一个面向多种数据库和对象存储的备份工具。当前页面负责展示备份模型、触发任务、查看每次备份的详细日志和浏览归档文件。
            </p>
            <p>
              本仓库为当前部署使用的 GoBackup 分支，仓库地址、构建时间和依赖版本均以本地构建产物为准。
            </p>
            <div className="flex flex-wrap gap-2">
              <Tag color="blue">Go</Tag>
              <Tag color="green">React</Tag>
              <Tag color="violet">Semi Design</Tag>
              <Tag color="orange">TypeScript</Tag>
            </div>
            <div className="flex flex-wrap gap-4 pt-2">
              <a
                className="inline-flex items-center gap-2 text-primary hover:underline"
                href={repositoryURL}
                rel="noreferrer"
                target="_blank"
              >
                <GitBranch className="size-4" /> 当前仓库
                <ExternalLink className="size-3" />
              </a>
              <a
                className="inline-flex items-center gap-2 text-primary hover:underline"
                href="https://github.com/gobackup/gobackup"
                rel="noreferrer"
                target="_blank"
              >
                上游项目 <ExternalLink className="size-3" />
              </a>
              <a
                className="inline-flex items-center gap-2 text-primary hover:underline"
                href="https://gobackup.github.io"
                rel="noreferrer"
                target="_blank"
              >
                使用文档 <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </Card>
        <Card shadows="hover" title="运行信息">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2">
              <ServerCog className="size-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">服务版本</span>
              <span className="ml-auto font-mono">
                {statusQuery.isLoading ? (
                  <Skeleton.Title style={{ height: 16, width: 56 }} />
                ) : (
                  statusQuery.data?.version ?? '未连接'
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2">
              <Heart className="size-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">服务地址</span>
              <span className="ml-auto max-w-40 truncate font-mono" title={window.location.origin}>
                {window.location.origin}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2">
              <Heart className="size-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">前端构建时间</span>
              <span className="ml-auto font-mono">{buildTime}</span>
            </div>
          </div>
        </Card>
      </PageSection>
    </Page>
  )
}
