import { buildBackupUrl } from '@/api/gobackup'
import { authStore } from '@/store/auth'

/**
 * 流式接口的鉴权请求。
 *
 * 后端 /api 走 HTTP Basic / Bearer 鉴权，而浏览器原生的 EventSource 无法
 * 携带 Authorization 头，直接用 fetch 又不会自动带上登录态，所以这里统一
 * 给流式请求补上 Bearer token（同时保留 credentials，兼容 Basic 场景）。
 */
export function authorizedFetch(url: string, init: RequestInit = {}) {
  const token = authStore.getState().getAccessToken()
  const headers = new Headers(init.headers)

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, { credentials: 'include', ...init, headers })
}

/** 构造流式接口地址。 */
export function buildStreamUrl(
  path: string,
  params: Record<string, string | number | undefined> = {}
) {
  const normalized: Record<string, string | undefined> = {}

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      normalized[key] = String(value)
    }
  })

  return buildBackupUrl(path, normalized)
}
