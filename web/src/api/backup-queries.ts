import { queryOptions } from '@tanstack/react-query'

import { gobackupApi } from '@/api/gobackup'

const backupKeys = {
  all: ['gobackup'] as const,
  files: (model: string, parent: string) => ['gobackup', 'files', model, parent] as const,
  models: () => [...backupKeys.all, 'models'] as const,
  tasks: (includeFinished: boolean) => [...backupKeys.all, 'tasks', includeFinished] as const
}

export const backupQueries = {
  files: (model: string, parent: string) =>
    queryOptions({
      enabled: Boolean(model),
      queryFn: ({ signal }) => gobackupApi.files(model, parent, signal),
      queryKey: backupKeys.files(model, parent)
    }),
  models: () =>
    queryOptions({
      queryFn: ({ signal }) => gobackupApi.models(signal),
      queryKey: backupKeys.models(),
      staleTime: 30_000
    }),
  /**
   * 任务中心数据。有任务进行中时高频轮询（进度条要动起来），
   * 全部结束后放慢到低频，避免无谓的请求。
   */
  tasks: (options: { includeFinished?: boolean } = {}) => {
    const includeFinished = options.includeFinished ?? true

    return queryOptions({
      queryFn: ({ signal }) => gobackupApi.tasks({ includeFinished, limit: 50 }, signal),
      queryKey: backupKeys.tasks(includeFinished),
      refetchInterval: query => ((query.state.data?.running ?? 0) > 0 ? 1000 : 10_000),
      refetchIntervalInBackground: false
    })
  }
}
