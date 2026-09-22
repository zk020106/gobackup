import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HasPermission } from '@/components/has-permission'
import { authStore } from '@/store/auth'
import type { AuthSession } from '@/types/auth'

const limitedSession: AuthSession = {
  accessToken: 'limited-token',
  user: {
    id: 'limited',
    name: 'Limited User',
    permissions: ['system:user:read'],
    roles: ['viewer']
  }
}

const ownerSession: AuthSession = {
  accessToken: 'owner-token',
  user: {
    id: 'root',
    name: 'Root Admin',
    permissions: ['system:user:read'],
    roles: ['owner']
  }
}

describe('HasPermission', () => {
  afterEach(() => {
    cleanup()
    authStore.getState().clearSession()
    window.localStorage.clear()
  })

  it('allows all permissions in no-auth mode when there is no active session', () => {
    render(<HasPermission permission="system:user:create">create action</HasPermission>)

    expect(screen.getByText('create action')).toBeInTheDocument()
  })

  it('renders fallback when the active session lacks the required permission', () => {
    authStore.getState().setSession(limitedSession)

    render(
      <HasPermission fallback="hidden action" permission="system:user:delete">
        delete action
      </HasPermission>
    )

    expect(screen.queryByText('delete action')).not.toBeInTheDocument()
    expect(screen.getByText('hidden action')).toBeInTheDocument()
  })

  it('renders children when the active session owns one of the required permissions', () => {
    authStore.getState().setSession(limitedSession)

    render(
      <HasPermission permission={['system:user:update', 'system:user:read']}>
        read action
      </HasPermission>
    )

    expect(screen.getByText('read action')).toBeInTheDocument()
  })

  it('allows owner sessions to pass write permissions for persisted mock users', () => {
    authStore.getState().setSession(ownerSession)

    render(<HasPermission permission="system:user:delete">delete action</HasPermission>)

    expect(screen.getByText('delete action')).toBeInTheDocument()
  })
})
