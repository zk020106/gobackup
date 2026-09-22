import { createStore } from 'zustand/vanilla'

import {
  hasPermission as hasUserPermission,
  resolveSessionPermissions,
  type PermissionInput
} from '@/lib/permissions'
import type { AuthSession, AuthUser } from '@/types/auth'

export interface AuthStoreState {
  clearSession: () => void
  getAccessToken: () => string | undefined
  hasPermission: (permission: PermissionInput) => boolean
  session?: AuthSession
  setSession: (session: AuthSession) => void
}

interface AuthStoreOptions {
  persist?: boolean
  storageKey?: string
}

interface StoredAuthPayload {
  session?: unknown
  version?: number
}

export const AUTH_STORAGE_KEY = 'gobackup:auth:v1'
const AUTH_STORAGE_VERSION = 1

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function normalizeUser(value: unknown): AuthUser | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Partial<AuthUser>

  if (typeof record.id !== 'string' || typeof record.name !== 'string') {
    return undefined
  }

  return {
    ...(typeof record.avatar === 'string' ? { avatar: record.avatar } : {}),
    id: record.id,
    name: record.name,
    permissions: normalizeStringArray(record.permissions),
    roles: normalizeStringArray(record.roles)
  }
}

function normalizeSession(value: unknown): AuthSession | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Partial<AuthSession>
  const user = normalizeUser(record.user)

  if (typeof record.accessToken !== 'string' || !record.accessToken || !user) {
    return undefined
  }

  if (typeof record.expiresAt === 'number' && record.expiresAt <= Date.now()) {
    return undefined
  }

  return {
    accessToken: record.accessToken,
    ...(typeof record.expiresAt === 'number' ? { expiresAt: record.expiresAt } : {}),
    ...(typeof record.refreshToken === 'string' ? { refreshToken: record.refreshToken } : {}),
    user
  }
}

function readStoredSession(storageKey: string) {
  const storage = getLocalStorage()

  if (!storage) {
    return undefined
  }

  try {
    const raw = storage.getItem(storageKey)

    if (!raw) {
      return undefined
    }

    const parsed = JSON.parse(raw) as StoredAuthPayload

    if (parsed.version !== AUTH_STORAGE_VERSION) {
      storage.removeItem(storageKey)
      return undefined
    }

    const session = normalizeSession(parsed.session)

    if (!session) {
      storage.removeItem(storageKey)
    }

    return session
  } catch {
    storage.removeItem(storageKey)
  }

  return undefined
}

function writeStoredSession(storageKey: string, session: AuthSession) {
  const storage = getLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(
      storageKey,
      JSON.stringify({
        session,
        version: AUTH_STORAGE_VERSION
      })
    )
  } catch {
    // Storage failures should not break the in-memory session.
  }
}

function removeStoredSession(storageKey: string) {
  const storage = getLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(storageKey)
  } catch {
    // Ignore disabled storage cleanup failures.
  }
}

export function createAuthStore(initial?: AuthSession, options: AuthStoreOptions = {}) {
  const storageKey = options.storageKey ?? AUTH_STORAGE_KEY
  const initialSession =
    normalizeSession(initial) ?? (options.persist ? readStoredSession(storageKey) : undefined)

  return createStore<AuthStoreState>()((set, get) => ({
    clearSession: () => {
      set({ session: undefined })

      if (options.persist) {
        removeStoredSession(storageKey)
      }
    },
    getAccessToken: () => get().session?.accessToken,
    hasPermission: permission =>
      hasUserPermission(resolveSessionPermissions(get().session) ?? [], permission),
    session: initialSession,
    setSession: session => {
      const normalized = normalizeSession(session)

      if (!normalized) {
        return
      }

      set({ session: normalized })

      if (options.persist) {
        writeStoredSession(storageKey, normalized)
      }
    }
  }))
}

export const authStore = createAuthStore(undefined, { persist: true })
