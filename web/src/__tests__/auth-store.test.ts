import { afterEach, describe, expect, it } from 'vitest'

import { AUTH_STORAGE_KEY, createAuthStore } from '@/store/auth'
import type { AuthSession } from '@/types/auth'

const session: AuthSession = {
  accessToken: 'access-token',
  user: {
    id: 'root',
    name: 'Root Admin',
    permissions: ['overview:read'],
    roles: ['viewer']
  }
}

const ownerSession: AuthSession = {
  accessToken: 'owner-token',
  user: {
    id: 'root',
    name: 'Root Admin',
    permissions: ['overview:read'],
    roles: ['owner']
  }
}

describe('auth store', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('persists and restores a valid auth session', () => {
    const store = createAuthStore(undefined, {
      persist: true,
      storageKey: AUTH_STORAGE_KEY
    })

    store.getState().setSession(session)

    const restored = createAuthStore(undefined, {
      persist: true,
      storageKey: AUTH_STORAGE_KEY
    })

    expect(restored.getState().session?.accessToken).toBe('access-token')
    expect(restored.getState().getAccessToken()).toBe('access-token')
  })

  it('clears persisted sessions and checks permissions from the active user', () => {
    const store = createAuthStore(session, {
      persist: true,
      storageKey: AUTH_STORAGE_KEY
    })

    expect(store.getState().hasPermission('overview:read')).toBe(true)
    expect(store.getState().hasPermission('system:user:read')).toBe(false)

    store.getState().clearSession()

    expect(store.getState().session).toBeUndefined()
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('treats owner sessions as unrestricted for permission checks', () => {
    const store = createAuthStore(ownerSession)

    expect(store.getState().hasPermission('system:user:delete')).toBe(true)
  })
})
