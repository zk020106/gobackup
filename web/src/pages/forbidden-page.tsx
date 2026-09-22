import { useNavigate } from '@tanstack/react-router'

import { ADMIN_DEFAULT_PATH } from '@/router/app-data'
import { StatusPage } from '@/pages/status-page'

interface ForbiddenPageProps {
  permission?: string
}

/** 后台 403 页面：保留应用壳，阻止未授权页面内容加载。 */
export default function ForbiddenPage(_props: ForbiddenPageProps) {
  const navigate = useNavigate()

  return (
    <StatusPage
      actions={[
        {
          label: '返回首页',
          onClick: () => void navigate({ replace: true, to: ADMIN_DEFAULT_PATH })
        }
      ]}
      code="403"
      dataSlot="forbidden-page"
      description="当前账号缺少进入该页面所需的权限。"
      title="无权访问当前页面"
    />
  )
}
