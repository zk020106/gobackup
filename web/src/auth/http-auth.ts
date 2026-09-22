import { authApi } from '@/api/auth'
import { configureHttp } from '@/lib/http'
import { authStore } from '@/store/auth'
import { createTokenRefreshQueue } from '@/auth/token-refresh'

let configured = false

const tokenRefreshQueue = createTokenRefreshQueue({
  async refresh() {
    const refreshToken = authStore.getState().session?.refreshToken

    if (!refreshToken) {
      return undefined
    }

    const session = await authApi.refresh(refreshToken)
    authStore.getState().setSession(session)

    return session.accessToken
  }
})

export function setupHttpAuth() {
  if (configured) {
    return
  }

  configureHttp({
    getAccessToken: () => authStore.getState().getAccessToken(),
    onTokenRefresh: () => tokenRefreshQueue.getFreshToken(),
    onUnauthorized: () => authStore.getState().clearSession()
  })
  configured = true
}
