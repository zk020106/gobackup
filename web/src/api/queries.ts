import { queryOptions } from '@tanstack/react-query'

import { navigationKeys } from '@/lib/query-keys'
import { adminMenu } from '@/router/app-data'

// 导航菜单直接使用前端路由定义，不再经过 mock 接口。
export const navigationQueries = {
  menu: () =>
    queryOptions({
      placeholderData: adminMenu,
      queryFn: () => Promise.resolve(adminMenu),
      queryKey: navigationKeys.menu(),
      staleTime: Infinity
    })
}
