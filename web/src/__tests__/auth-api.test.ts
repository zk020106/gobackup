import { describe, expect, it } from 'vitest'

import { createHttpAuthApi, type AuthApiHttpClient } from '@/api/auth'
import type { HttpRequestConfig } from '@/lib/http'
import type { AuthSession } from '@/types/auth'

const session: AuthSession = {
  accessToken: 'dG9rZW4=',
  refreshToken: 'dG9rZW4=',
  user: {
    id: 'admin',
    name: 'admin',
    permissions: ['*'],
    roles: ['owner']
  }
}

describe('auth api service', () => {
  it('logs in through the backend auth endpoint', async () => {
    const calls: Array<{ config?: HttpRequestConfig; data?: unknown; url: string }> = []
    const client: AuthApiHttpClient = {
      get: <T>() => Promise.resolve(undefined as T),
      post: <T>(url: string, data?: unknown, config?: HttpRequestConfig) => {
        calls.push({ config, data, url })
        return Promise.resolve(session as T)
      }
    }
    const api = createHttpAuthApi(client)

    await expect(api.login({ username: 'admin', password: 'secret' })).resolves.toEqual(session)
    expect(calls).toEqual([
      {
        config: undefined,
        data: { username: 'admin', password: 'secret' },
        url: '/auth/login'
      }
    ])
  })

  it('sends refresh requests with refresh replay disabled', async () => {
    const calls: Array<{ config?: HttpRequestConfig; data?: unknown; url: string }> = []
    const client: AuthApiHttpClient = {
      get: <T>() => Promise.resolve(undefined as T),
      post: <T>(url: string, data?: unknown, config?: HttpRequestConfig) => {
        calls.push({ config, data, url })
        return Promise.resolve(session as T)
      }
    }
    const api = createHttpAuthApi(client)

    await api.refresh('refresh-token')

    expect(calls).toEqual([
      {
        config: { skipAuthRefresh: true },
        data: { refreshToken: 'refresh-token' },
        url: '/auth/refresh'
      }
    ])
  })
})
