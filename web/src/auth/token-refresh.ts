export interface TokenRefreshQueueOptions {
  refresh: () => Promise<string | undefined>
}

/** 合并并发 token 刷新请求，避免多个 401 同时触发重复刷新。 */
export function createTokenRefreshQueue({ refresh }: TokenRefreshQueueOptions) {
  let inflight: Promise<string | undefined> | undefined

  return {
    getFreshToken() {
      inflight ??= refresh().finally(() => {
        inflight = undefined
      })

      return inflight
    }
  }
}
