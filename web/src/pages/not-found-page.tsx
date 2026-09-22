import { useNavigate } from '@tanstack/react-router'

import { ADMIN_DEFAULT_PATH } from '@/router/app-data'
import { StatusPage } from '@/pages/status-page'

/** 渲染后台 404 页面，提示路径不存在并提供回首页入口。 */
export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <StatusPage
      actions={[
        {
          label: '返回首页',
          onClick: () => void navigate({ replace: true, to: ADMIN_DEFAULT_PATH })
        }
      ]}
      code="404"
      dataSlot="not-found-page"
      description="抱歉，您访问的页面不存在或已被移除。"
      title="页面不存在"
    />
  )
}
