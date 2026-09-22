import { MutationCache, QueryClient } from '@tanstack/react-query'
import { Toast } from '@douyinfe/semi-ui-19'

import { HttpError } from '@/lib/http'

const ONE_MINUTE = 60 * 1000

// 全局 QueryClient：缓存、重试、mutation 错误提示等服务端状态策略集中在这里。
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    // mutation 失败统一 toast，页面只需处理成功路径。
    onError: error => {
      Toast.error(error instanceof Error ? error.message : '操作失败，请稍后重试')
    }
  }),
  defaultOptions: {
    mutations: {
      retry: false
    },
    queries: {
      // 管理后台数据默认 1 分钟内视为新鲜，减少路由切换时的重复请求。
      gcTime: 10 * ONE_MINUTE,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // 4xx 多数是明确的业务/权限错误，不做无效重试；408/429 保留重试机会。
        if (error instanceof HttpError && isClientError(error.status)) {
          return false
        }

        return failureCount < 2
      },
      staleTime: ONE_MINUTE
    }
  }
})

function isClientError(status: number | undefined) {
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429
}
