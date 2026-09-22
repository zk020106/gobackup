import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import { BaseLayout } from '@/layouts'
import { RouteErrorPage } from '@/pages/error-boundary-page'
import { ADMIN_DEFAULT_PATH } from '@/router/app-data'
import { getAdminPageDefinition } from '@/router/routes'

const LoginRoutePage = lazy(() =>
  import('@/pages/login-page').then(module => ({ default: module.LoginRoutePage }))
)
const NotFoundPage = lazy(() => import('@/pages/not-found-page'))
const FileBrowserPage = lazy(() => import('@/pages/file-browser-page'))

const rootRoute = createRootRoute({
  component: () => (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  )
})

const loginRoute = createRoute({
  component: LoginRoutePage,
  getParentRoute: () => rootRoute,
  path: '/login'
})

const adminLayoutRoute = createRoute({
  component: BaseLayout,
  getParentRoute: () => rootRoute,
  id: 'admin'
})

const indexRoute = createRoute({
  beforeLoad: () => {
    throw redirect({ replace: true, to: ADMIN_DEFAULT_PATH })
  },
  getParentRoute: () => adminLayoutRoute,
  path: '/'
})

function createAdminPageRoute<TPath extends string>(path: TPath) {
  const page = getAdminPageDefinition(path)

  return createRoute({
    component: page.component,
    getParentRoute: () => adminLayoutRoute,
    path,
    staticData: { permission: page.permission }
  })
}

const overviewRoute = createAdminPageRoute('/overview')
const tasksRoute = createAdminPageRoute('/tasks')
const environmentRoute = createAdminPageRoute('/environment')
const logsRoute = createAdminPageRoute('/logs')
const aboutRoute = createAdminPageRoute('/about')
const configEditorRoute = createAdminPageRoute('/settings/config')

const browserRoute = createRoute({
  component: FileBrowserPage,
  getParentRoute: () => adminLayoutRoute,
  path: '/browser/$model'
})

const previewServerErrorRoute = import.meta.env.DEV
  ? createRoute({
      component: () => {
        throw new Error('Preview route error boundary')
      },
      getParentRoute: () => adminLayoutRoute,
      path: '/__preview/500'
    })
  : undefined

const fallbackRoute = createRoute({
  component: NotFoundPage,
  getParentRoute: () => adminLayoutRoute,
  path: '$'
})

const adminChildRoutes = [
  indexRoute,
  overviewRoute,
  tasksRoute,
  environmentRoute,
  logsRoute,
  aboutRoute,
  configEditorRoute,
  browserRoute,
  ...(previewServerErrorRoute ? [previewServerErrorRoute] : []),
  fallbackRoute
]

const routeTree = rootRoute.addChildren([
  loginRoute,
  adminLayoutRoute.addChildren(adminChildRoutes)
])

export function resolveRouterBasepath(baseUrl = import.meta.env.BASE_URL) {
  const normalized = baseUrl.replace(/\/+$/, '')
  return normalized || '/'
}

export function createAppRouter(history: RouterHistory = createBrowserHistory()) {
  return createRouter({
    basepath: resolveRouterBasepath(),
    defaultErrorComponent: RouteErrorPage,
    history,
    routeTree
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }

  interface StaticDataRouteOption {
    permission?: string
  }
}
