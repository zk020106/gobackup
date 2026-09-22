import type { ErrorComponentProps } from '@tanstack/react-router'
import { useNavigate, useRouter } from '@tanstack/react-router'

import { ADMIN_DEFAULT_PATH } from '@/router/app-data'
import { StatusPage } from '@/pages/status-page'

/** 路由错误兜底页：替换 TanStack 默认错误面板，提供重试与回到首页入口。 */
export function RouteErrorPage(_props: ErrorComponentProps) {
  const navigate = useNavigate()
  const router = useRouter()

  return (
    <StatusPage
      actions={[
        {
          label: '重试',
          onClick: () => void router.invalidate(),
          variant: 'outline'
        },
        {
          label: '返回首页',
          onClick: () => void navigate({ replace: true, to: ADMIN_DEFAULT_PATH })
        }
      ]}
      code="500"
      dataSlot="route-error-page"
      description="当前页面发生异常，请重试或返回首页。"
      title="页面加载失败"
    />
  )
}
