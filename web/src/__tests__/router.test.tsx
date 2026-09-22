import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/lib/query-client'
import { RouteErrorPage } from '@/pages/error-boundary-page'
import { createAppRouter, resolveRouterBasepath } from '@/router'
import { authStore } from '@/store/auth'
import { preferenceStore } from '@/store/preferences'
import { tabsStore } from '@/store/tabs'
import type { AuthSession } from '@/types/auth'

const overviewOnlySession: AuthSession = {
  accessToken: 'overview-only-token',
  user: {
    id: 'overview-only',
    name: 'Overview Only',
    permissions: ['overview:read'],
    roles: ['viewer']
  }
}

function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  return router
}

describe('router basepath', () => {
  it('uses root for local builds', () => {
    expect(resolveRouterBasepath('/')).toBe('/')
  })

  it('normalizes GitHub Pages project paths', () => {
    expect(resolveRouterBasepath('/react-admin/')).toBe('/react-admin')
  })
})

describe('admin route tree', () => {
  afterEach(() => {
    cleanup()
    authStore.getState().clearSession()
    preferenceStore.getState().resetPreferences()
    tabsStore.setState({
      activeKey: '/overview',
      tabs: [
        { affix: true, icon: 'LayoutDashboard', key: '/overview', path: '/overview', title: '概览' }
      ]
    })
    tabsStore.getState().clearPersistedTabs()
    queryClient.clear()
    window.localStorage.clear()
  })

  it('redirects the index route to the default admin path', async () => {
    const router = renderAt('/')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/overview')
    })
  })

  it('renders the in-shell 404 page for unknown paths', async () => {
    renderAt('/definitely-missing')

    expect(await screen.findByText('404')).toBeInTheDocument()
    // 壳仍然可用：侧栏导航保持渲染。
    expect(await screen.findByRole('navigation', { name: '侧栏导航' })).toBeInTheDocument()
  })

  it('does not open a workspace tab for unknown paths', async () => {
    renderAt('/definitely-missing')

    await screen.findByText('404')

    expect(tabsStore.getState().tabs.some(tab => tab.path === '/definitely-missing')).toBe(false)
  })

  it('renders an in-shell 403 page for routes without permission', async () => {
    authStore.getState().setSession(overviewOnlySession)

    // 只授予 overview:read，访问需要 config:read 的页面应当落在 403。
    renderAt('/settings/config')

    expect(await screen.findByText('403')).toBeInTheDocument()
    expect(document.querySelector("[data-slot='forbidden-page']")).toBeInTheDocument()
    expect(document.querySelector("[data-slot='sidebar']")).toBeInTheDocument()
    expect(tabsStore.getState().tabs.some(tab => tab.path === '/settings/config')).toBe(false)
  })

  it('registers the route error boundary fallback', () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/overview'] }))

    expect(router.options.defaultErrorComponent).toBe(RouteErrorPage)
  })

  it('renders the in-shell error boundary for route errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      renderAt('/__preview/500')

      expect(await screen.findByText('500')).toBeInTheDocument()
      expect(document.querySelector("[data-slot='route-error-page']")).toBeInTheDocument()
      expect(document.querySelector("[data-slot='sidebar']")).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    } finally {
      consoleError.mockRestore()
      consoleWarn.mockRestore()
    }
  })
})
