import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useMatches, useNavigate } from '@tanstack/react-router'
import { useBoolean, useKeyPress } from 'ahooks'
import { Settings2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { authApi } from '@/api/auth'
import { runtimeEnv } from '@/config/env'
import { getAdminMessages } from '@/i18n/admin-i18n'
import { filterAuthorizedMenu, hasPermission, resolveSessionPermissions } from '@/lib/permissions'
import { getRouteRefreshQueryKeys, navigationKeys } from '@/lib/query-keys'
import {
  affixTabs,
  findMenuRecordByPath,
  getDefaultMenuPath,
  getMenuTitle,
  normalizeAdminPath
} from '@/router/app-data'
import { authStore } from '@/store/auth'
import { preferenceStore } from '@/store/preferences'
import { tabsStore } from '@/store/tabs'
import { applyAdminTheme } from '@/theme'
import type { AdminPreferences, MenuRecord, TabRecord } from '@/types'
import { SidebarInset, SidebarProvider } from '@/layouts/sidebar-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { findActiveMenuRecord } from '@/layouts/navigation'
import { AdminHeader } from '@/layouts/admin-header'
import { AdminSidebar, MixedSidebarFrame } from '@/layouts/admin-sidebar'
import { PageTransitionLoading, PageTransitionProgress } from '@/layouts/page-transitions'
import { PageSurface } from '@/layouts/page-surface'
import { resolvePreferencesButtonPlacement } from '@/layouts/preferences-options'
import { Tabbar } from '@/layouts/tabbar'
import { getWorkspaceRootMenu, resolveWorkspaceTab } from '@/layouts/workspace-navigation'
import { navigationQueries } from '@/api/queries'
import ForbiddenPage from '@/pages/forbidden-page'

// 按需弹层走懒加载，避免全局搜索、偏好设置面板等只在特定场景使用的依赖进入首屏主包。
const loadPreferencesSheet = () => import('@/layouts/preferences-sheet')
const loadWorkspaceOverlays = () => import('@/layouts/workspace-overlays')

const PreferencesSheet = lazy(() =>
  loadPreferencesSheet().then(module => ({ default: module.PreferencesSheet }))
)
const GlobalSearchDialog = lazy(() =>
  loadWorkspaceOverlays().then(module => ({ default: module.GlobalSearchDialog }))
)
const LockScreenSetupDialog = lazy(() =>
  loadWorkspaceOverlays().then(module => ({ default: module.LockScreenSetupDialog }))
)
const LockScreenOverlay = lazy(() =>
  loadWorkspaceOverlays().then(module => ({ default: module.LockScreenOverlay }))
)

const emptyMenu: MenuRecord[] = []
const anonymousPermissions: readonly string[] = []
const unrestrictedPermissions: readonly string[] = ['*']
const lockScreenSessionKey = 'gobackup:lock-screen'

type LockScreenSessionState = {
  password: string
  screenLocked: boolean
}

const emptyLockScreenSession: LockScreenSessionState = {
  password: '',
  screenLocked: false
}

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

function readLockScreenSession(): LockScreenSessionState {
  const storage = getSessionStorage()

  if (!storage) {
    return emptyLockScreenSession
  }

  try {
    const raw = storage.getItem(lockScreenSessionKey)

    if (!raw) {
      return emptyLockScreenSession
    }

    const parsed = JSON.parse(raw) as Partial<LockScreenSessionState>

    if (parsed.screenLocked !== true || typeof parsed.password !== 'string' || !parsed.password) {
      return emptyLockScreenSession
    }

    return {
      password: parsed.password,
      screenLocked: true
    }
  } catch {
    return emptyLockScreenSession
  }
}

function persistLockScreenSession(password: string) {
  const storage = getSessionStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(
      lockScreenSessionKey,
      JSON.stringify({
        password,
        screenLocked: true
      })
    )
  } catch {
    // Ignore unavailable session storage; the in-memory lock state still works for this render.
  }
}

function clearLockScreenSession() {
  try {
    getSessionStorage()?.removeItem(lockScreenSessionKey)
  } catch {
    // Ignore unavailable session storage.
  }
}

// 函数：resolveInitialWorkspaceTabs。合并固定标签和恢复的标签，并用菜单刷新标题。
function resolveInitialWorkspaceTabs(currentTabs: TabRecord[], menu: MenuRecord[]) {
  const mergedTabs = new Map<string, TabRecord>()

  for (const tab of affixTabs) {
    const resolved = resolveWorkspaceTab(tab.path, menu)
    mergedTabs.set(resolved.key, { ...resolved, affix: true })
  }

  for (const tab of currentTabs) {
    const path = normalizeAdminPath(tab.path, menu)

    if (path !== tab.path) {
      continue
    }

    const resolved = resolveWorkspaceTab(path, menu)
    mergedTabs.set(resolved.key, {
      ...resolved,
      ...(tab.badge ? { badge: tab.badge } : {}),
      affix: Boolean(tab.affix || resolved.affix),
      icon: tab.icon ?? resolved.icon
    })
  }

  return [...mergedTabs.values()]
}

// 函数：resolveInitialActiveKey。为初始化后的标签页选择稳定激活项。
function resolveInitialActiveKey(
  activeKey: string | undefined,
  tabs: TabRecord[],
  activePath: string
) {
  if (activeKey && tabs.some(tab => tab.key === activeKey)) {
    return activeKey
  }

  if (tabs.some(tab => tab.key === activePath)) {
    return activePath
  }

  return tabs[0]?.key
}

// 函数：useEverTrue。值首次变为 true 后保持 true，让弹层懒挂载后不再卸载以保留关闭动画。
function useEverTrue(value: boolean) {
  const [ever, setEver] = useState(value)

  if (value && !ever) {
    setEver(true)
  }

  return ever
}

function selectActiveRoutePermission(
  matches: ReadonlyArray<{ staticData?: { permission?: string } }>
) {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const permission = matches[index]?.staticData?.permission

    if (permission) {
      return permission
    }
  }

  return undefined
}

// 组件：AdminWorkspace。用于组织后台布局状态、路由同步、标签页和偏好设置。
function AdminWorkspace() {
  const queryClient = useQueryClient()
  const menuQuery = useQuery(navigationQueries.menu())
  const preferences = useStore(preferenceStore, state => state.preferences)
  const setPreferences = useStore(preferenceStore, state => state.setPreferences)
  const authSession = useStore(authStore, state => state.session)
  const tabs = useStore(tabsStore, state => state.tabs)
  const routePathname = useLocation({ select: location => location.pathname })
  const routePermission = useMatches({
    select: matches => selectActiveRoutePermission(matches)
  })
  const routerNavigate = useNavigate()
  const navigationMenu = menuQuery.data ?? emptyMenu
  const userPermissions =
    resolveSessionPermissions(authSession) ??
    (runtimeEnv.authRequired ? anonymousPermissions : unrestrictedPermissions)
  const activeMenu = useMemo(
    () => filterAuthorizedMenu(navigationMenu, userPermissions),
    [navigationMenu, userPermissions]
  )
  const routeAllowed = hasPermission(userPermissions, routePermission)
  // 路由已保证路径真实存在（未知路径由 $ 通配路由渲染 404），无需再做归一化。
  const activePath = routePathname
  const lastActiveByRootRef = useRef<Record<string, string>>({})
  const tabsInitializedRef = useRef(false)
  const [manualHeaderMixedSideRoot, setManualHeaderMixedSideRoot] = useState<{
    anchorPath: string
    path: string
  } | null>(null)
  const [manualMixedRoot, setManualMixedRoot] = useState<{
    anchorPath: string
    path: string
  } | null>(null)
  const [scrollHeaderHidden, setScrollHeaderHidden] = useState(false)
  const [contentMaximized, setContentMaximized] = useState(false)
  const [preferencesOpen, preferencesActions] = useBoolean(false)
  const [searchOpen, searchActions] = useBoolean(false)
  const [lockOpen, lockActions] = useBoolean(false)
  const preferencesMounted = useEverTrue(preferencesOpen)
  const searchMounted = useEverTrue(searchOpen)
  const lockSetupMounted = useEverTrue(lockOpen)
  const [lockScreenSession, setLockScreenSession] = useState(readLockScreenSession)
  const isMobile = useIsMobile()
  const messages = useMemo(() => getAdminMessages(preferences.appLocale), [preferences.appLocale])
  const screenLocked = lockScreenSession.screenLocked
  const lockScreenPassword = lockScreenSession.password
  const effectiveLayout: AdminPreferences['layout'] =
    isMobile && preferences.layout !== 'full-content' ? 'sidebar-nav' : preferences.layout
  const headerHidden =
    ['auto', 'auto-scroll'].includes(preferences.headerMode) &&
    effectiveLayout !== 'full-content' &&
    scrollHeaderHidden

  useKeyPress(
    ['ctrl.k', 'meta.k'],
    event => {
      event.preventDefault()
      searchActions.setTrue()
    },
    {
      exactMatch: true,
      useCapture: true,
      events: ['keydown'],
      target: () =>
        preferences.shortcutKeysEnable && preferences.shortcutKeysGlobalSearch ? document : null
    }
  )
  useKeyPress(
    'alt.l',
    event => {
      event.preventDefault()
      lockActions.setTrue()
    },
    {
      exactMatch: true,
      useCapture: true,
      events: ['keydown'],
      target: () =>
        preferences.shortcutKeysEnable && preferences.shortcutKeysGlobalLockScreen ? document : null
    }
  )
  useKeyPress(
    'alt.q',
    event => {
      event.preventDefault()
      logout()
    },
    {
      exactMatch: true,
      useCapture: true,
      events: ['keydown'],
      target: () =>
        preferences.shortcutKeysEnable && preferences.shortcutKeysGlobalLogout ? document : null
    }
  )
  useKeyPress(
    'esc',
    () => {
      searchActions.setFalse()
      lockActions.setFalse()
      preferencesActions.setFalse()
    },
    {
      exactMatch: true,
      useCapture: true,
      events: ['keydown'],
      target: () =>
        preferences.shortcutKeysEnable && preferences.shortcutKeysGlobalEscape ? document : null
    }
  )

  useEffect(() => {
    if (tabsInitializedRef.current || activeMenu.length === 0) {
      return
    }

    const current = tabsStore.getState()
    const initialTabs = resolveInitialWorkspaceTabs(current.tabs, activeMenu)

    tabsStore.setState({
      activeKey: resolveInitialActiveKey(current.activeKey, initialTabs, activePath),
      tabs: initialTabs
    })

    if (findMenuRecordByPath(activePath, activeMenu)) {
      tabsStore.getState().openTab(resolveWorkspaceTab(activePath, activeMenu))
    }

    tabsInitializedRef.current = true
  }, [activeMenu, activePath])

  useEffect(() => {
    const current = tabsStore.getState()
    let titlesChanged = false
    const tabs = current.tabs.map(tab => {
      const title = getMenuTitle(tab.path, activeMenu)

      if (title === tab.title) {
        return tab
      }

      titlesChanged = true
      return { ...tab, title }
    })

    // 标题没有变化时跳过写回，避免无意义的重渲染和持久化。
    if (titlesChanged) {
      tabsStore.setState({ tabs })
    }
  }, [activeMenu])

  useEffect(() => {
    // 空闲时预热按需弹层 chunk，首次打开即时响应且不占用首屏带宽。
    // 测试环境跳过：按需 import 可能与环境销毁产生竞态噪音。
    if (import.meta.env.MODE === 'test') {
      return
    }

    const schedule =
      window.requestIdleCallback?.bind(window) ??
      ((callback: () => void) => window.setTimeout(callback, 1500))
    const cancel = window.cancelIdleCallback?.bind(window) ?? window.clearTimeout.bind(window)
    const handle = schedule(() => {
      void loadPreferencesSheet()
      void loadWorkspaceOverlays()
    })

    return () => cancel(handle)
  }, [])

  useEffect(() => {
    applyAdminTheme({
      builtinType: preferences.themeBuiltinType,
      colorDestructive: preferences.themeColorDestructive,
      colorPrimary: preferences.themeColorPrimary,
      colorSuccess: preferences.themeColorSuccess,
      colorWarning: preferences.themeColorWarning,
      fontSize: preferences.themeFontSize,
      mode: preferences.colorMode === 'system' ? 'auto' : preferences.colorMode,
      radius: preferences.themeRadius,
      semiDarkHeader: preferences.themeSemiDarkHeader,
      semiDarkSidebar: preferences.themeSemiDarkSidebar,
      semiDarkSidebarSub: preferences.themeSemiDarkSidebarSub
    })
  }, [
    preferences.colorMode,
    preferences.themeBuiltinType,
    preferences.themeColorDestructive,
    preferences.themeColorPrimary,
    preferences.themeColorSuccess,
    preferences.themeColorWarning,
    preferences.themeFontSize,
    preferences.themeRadius,
    preferences.themeSemiDarkHeader,
    preferences.themeSemiDarkSidebar,
    preferences.themeSemiDarkSidebarSub
  ])

  useEffect(() => {
    if (preferences.tabbarPersist) {
      tabsStore.getState().persistTabs()
      return
    }

    tabsStore.getState().clearPersistedTabs()
  }, [preferences.tabbarPersist])

  useEffect(() => {
    const root = document.documentElement
    const filters = [
      preferences.colorGrayMode ? 'grayscale(1)' : '',
      preferences.colorWeakMode ? 'contrast(0.9) saturate(0.6)' : ''
    ].filter(Boolean)

    root.style.filter = filters.join(' ')

    return () => {
      root.style.filter = ''
    }
  }, [preferences.colorGrayMode, preferences.colorWeakMode])

  useEffect(() => {
    // 404 等菜单外路径不拼页面标题，只保留系统名。
    document.title =
      preferences.appDynamicTitle && findMenuRecordByPath(activePath, activeMenu)
        ? `${getMenuTitle(activePath, activeMenu)} - ${messages.common.systemName}`
        : messages.common.systemName
  }, [activeMenu, activePath, messages.common.systemName, preferences.appDynamicTitle])

  useEffect(() => {
    if (
      !['auto', 'auto-scroll'].includes(preferences.headerMode) ||
      effectiveLayout === 'full-content'
    ) {
      return
    }

    let lastScrollY = window.scrollY

    // 函数：handleScroll。根据滚动方向和高度更新顶栏隐藏状态。
    function handleScroll() {
      const nextScrollY = window.scrollY

      if (preferences.headerMode === 'auto') {
        setScrollHeaderHidden(nextScrollY > preferences.headerHeight)
      } else {
        setScrollHeaderHidden(nextScrollY > preferences.headerHeight && nextScrollY > lastScrollY)
      }

      lastScrollY = nextScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => window.removeEventListener('scroll', handleScroll)
  }, [effectiveLayout, preferences.headerHeight, preferences.headerMode])

  useEffect(() => {
    const nextRootMenu = getWorkspaceRootMenu(activePath, activeMenu)

    if (nextRootMenu.path !== activePath) {
      lastActiveByRootRef.current = {
        ...lastActiveByRootRef.current,
        [nextRootMenu.path]: activePath
      }
    }
  }, [activeMenu, activePath])

  useEffect(() => {
    // 仅菜单内路径产生工作区标签，404 等路径不留痕。
    if (findMenuRecordByPath(activePath, activeMenu)) {
      tabsStore.getState().openTab(resolveWorkspaceTab(activePath, activeMenu))
    }
  }, [activeMenu, activePath])

  // 函数：navigate。统一规整管理端路径后触发路由跳转。
  function navigate(path: string, options?: { replace?: boolean }) {
    void routerNavigate({
      replace: options?.replace,
      to: normalizeAdminPath(path, activeMenu)
    })
  }

  // 函数：closeTab。关闭指定标签并同步激活路由。
  function closeTab(key: string) {
    tabsStore.getState().closeTab(key)
    syncActiveTab()
  }

  // 函数：syncActiveTab。把标签仓库中的激活项同步到路由。
  function syncActiveTab() {
    const nextActive = tabsStore.getState().activeKey

    if (nextActive) {
      navigate(nextActive, { replace: true })
    }
  }

  // 函数：closeLeftTabs。关闭指定标签左侧标签并同步路由。
  function closeLeftTabs(key: string) {
    tabsStore.getState().closeLeft(key)
    syncActiveTab()
  }

  // 函数：closeRightTabs。关闭指定标签右侧标签并同步路由。
  function closeRightTabs(key: string) {
    tabsStore.getState().closeRight(key)
    syncActiveTab()
  }

  // 函数：closeOtherTabs。关闭其它标签并同步路由。
  function closeOtherTabs(key: string) {
    tabsStore.getState().closeOthers(key)
    syncActiveTab()
  }

  // 函数：closeAllTabs。关闭全部可关闭标签并同步路由。
  function closeAllTabs() {
    tabsStore.getState().closeAll()
    syncActiveTab()
  }

  // 函数：toggleTabPin。切换标签固定状态。
  function toggleTabPin(key: string) {
    tabsStore.getState().toggleAffix(key)
  }

  // 函数：refreshActiveTab。刷新当前页面关联的查询缓存。
  function refreshActiveTab() {
    const refreshKeys = getRouteRefreshQueryKeys(activePath)

    void Promise.all(
      refreshKeys.map(queryKey =>
        queryClient.invalidateQueries({
          queryKey
        })
      )
    )
  }

  // 函数：logout。退出登录并刷新依赖登录态的查询缓存。
  function logout() {
    void authApi.logout().finally(() => {
      clearLockScreenSession()
      authStore.getState().clearSession()
      tabsStore.getState().closeAll()
      void queryClient.invalidateQueries({ queryKey: navigationKeys.all })
      void routerNavigate({ replace: true, to: '/login' })
    })
  }

  // 函数：lockScreen。保存锁屏密码并进入锁屏状态。
  function lockScreen(password: string) {
    const nextSession = { password, screenLocked: true }

    persistLockScreenSession(password)
    setLockScreenSession(nextSession)
    lockActions.setFalse()
  }

  // 函数：unlockScreen。退出锁屏并清除锁屏密码。
  function unlockScreen() {
    clearLockScreenSession()
    setLockScreenSession(emptyLockScreenSession)
  }

  const rootMenu = getWorkspaceRootMenu(activePath, activeMenu)
  const manualMixedRootPath =
    manualMixedRoot?.anchorPath === activePath ? manualMixedRoot.path : undefined
  const manualHeaderMixedSideRootPath =
    manualHeaderMixedSideRoot?.anchorPath === activePath
      ? manualHeaderMixedSideRoot.path
      : undefined
  const mixedRootPath = manualMixedRootPath ?? rootMenu.path

  // 混合布局可临时覆盖可见根菜单，但不改变当前激活路由。
  const displayedMixedRoot = activeMenu.find(item => item.path === mixedRootPath) ?? rootMenu
  const headerMixedRoot = effectiveLayout === 'header-mixed-nav' ? displayedMixedRoot : rootMenu
  const headerMixedSideMenu = headerMixedRoot.children ?? []
  const activeHeaderMixedSideRoot = findActiveMenuRecord(headerMixedSideMenu, activePath)
  const selectedHeaderMixedSideRoot =
    headerMixedSideMenu.find(item => item.path === manualHeaderMixedSideRootPath) ??
    activeHeaderMixedSideRoot ??
    headerMixedSideMenu[0] ??
    headerMixedRoot
  // 这些开关先统一判定布局区域是否可用，再进入具体渲染分支。
  const sidebarEnabled =
    !contentMaximized &&
    preferences.sidebarEnable &&
    !preferences.sidebarHidden &&
    [
      'header-mixed-nav',
      'header-sidebar-nav',
      'mixed-nav',
      'sidebar-mixed-nav',
      'sidebar-nav'
    ].includes(effectiveLayout) &&
    (effectiveLayout !== 'header-mixed-nav' || headerMixedSideMenu.length > 0)
  const headerEnabled =
    !contentMaximized && effectiveLayout !== 'full-content' && preferences.headerVisible
  const tabbarEnabled = effectiveLayout !== 'full-content' && preferences.tabbarEnable
  const mixedSidebarEnabled =
    sidebarEnabled && ['header-mixed-nav', 'sidebar-mixed-nav'].includes(effectiveLayout)
  const primarySidebarEnabled = sidebarEnabled && !mixedSidebarEnabled
  const sidebarMenu =
    effectiveLayout === 'mixed-nav' && preferences.navigationSplit
      ? (displayedMixedRoot.children ?? [])
      : activeMenu
  const preferencesButtonPlacement = resolvePreferencesButtonPlacement({
    headerEnabled,
    isMobile,
    preferences,
    sidebarEnabled
  })

  // 函数：selectMixedRoot。选择混合导航根菜单并按配置激活子页面。
  function selectMixedRoot(item: MenuRecord) {
    const children = item.children ?? []

    setManualMixedRoot({ anchorPath: activePath, path: item.path })
    setManualHeaderMixedSideRoot(
      children[0]?.path ? { anchorPath: activePath, path: children[0].path } : null
    )

    if (children.length === 0) {
      if (effectiveLayout === 'mixed-nav' && preferences.navigationSplit) {
        return
      }

      navigate(item.path)
      return
    }

    if (preferences.sidebarAutoActivateChild) {
      navigate(lastActiveByRootRef.current[item.path] ?? getDefaultMenuPath(item))
    }
  }

  // 函数：selectHeaderMixedSideRoot。选择顶栏混合布局的侧栏根节点。
  function selectHeaderMixedSideRoot(item: MenuRecord) {
    const children = item.children ?? []

    setManualHeaderMixedSideRoot({ anchorPath: activePath, path: item.path })

    if (children.length === 0) {
      navigate(item.path)
      return
    }

    if (preferences.sidebarAutoActivateChild) {
      navigate(lastActiveByRootRef.current[item.path] ?? getDefaultMenuPath(item))
    }
  }

  return (
    <SidebarProvider
      open={!preferences.sidebarCollapsed}
      onOpenChange={open => setPreferences({ sidebarCollapsed: !open })}
      className={cn(
        effectiveLayout === 'header-sidebar-nav' && 'admin-layout-header-sidebar-nav',
        preferences.sidebarCollapsedShowTitle && 'admin-sidebar-collapsed-show-title'
      )}
      style={
        {
          '--admin-header-height': `${preferences.headerHeight}px`,
          '--admin-sidebar-offset': preferences.sidebarCollapsed
            ? '3rem'
            : `${preferences.sidebarWidth}px`,
          ...(effectiveLayout === 'header-sidebar-nav'
            ? { '--admin-header-brand-width': `${preferences.sidebarWidth}px` }
            : {}),
          '--sidebar-width-icon': preferences.sidebarCollapsedShowTitle ? '4.25rem' : '3rem',
          '--sidebar-width': `${preferences.sidebarWidth}px`
        } as React.CSSProperties
      }
    >
      {mixedSidebarEnabled && (
        <MixedSidebarFrame
          activePath={activePath}
          activeRootPath={
            effectiveLayout === 'header-mixed-nav'
              ? selectedHeaderMixedSideRoot.path
              : displayedMixedRoot.path
          }
          navigate={navigate}
          onSelectRoot={
            effectiveLayout === 'header-mixed-nav' ? selectHeaderMixedSideRoot : selectMixedRoot
          }
          rootAriaLabel={
            effectiveLayout === 'header-mixed-nav'
              ? messages.navigation.headerMixedSidebar
              : messages.navigation.mixedMain
          }
          rootMenus={effectiveLayout === 'header-mixed-nav' ? headerMixedSideMenu : activeMenu}
          selectedRoot={
            effectiveLayout === 'header-mixed-nav'
              ? selectedHeaderMixedSideRoot
              : displayedMixedRoot
          }
        />
      )}
      {primarySidebarEnabled && (
        <AdminSidebar activePath={activePath} menu={sidebarMenu} navigate={navigate} />
      )}
      <SidebarInset>
        {headerEnabled && (
          <AdminHeader
            activePath={activePath}
            activeRootPath={displayedMixedRoot.path}
            isMobile={isMobile}
            layout={effectiveLayout}
            menu={activeMenu}
            navigate={navigate}
            openLock={lockActions.setTrue}
            openPreferences={preferencesActions.setTrue}
            openSearch={searchActions.setTrue}
            onRefresh={refreshActiveTab}
            onLogout={logout}
            onSelectRoot={selectMixedRoot}
            preferencesButtonPlacement={preferencesButtonPlacement}
            sidebarEnabled={sidebarEnabled}
            hidden={headerHidden}
          />
        )}
        {tabbarEnabled && (
          <Tabbar
            activePath={activePath}
            closeAllTabs={closeAllTabs}
            closeLeftTabs={closeLeftTabs}
            closeOtherTabs={closeOtherTabs}
            closeRightTabs={closeRightTabs}
            closeTab={closeTab}
            contentMaximized={contentMaximized}
            navigate={navigate}
            onRefresh={refreshActiveTab}
            onToggleMaximize={() => setContentMaximized(current => !current)}
            tabs={tabs}
            toggleTabPin={toggleTabPin}
          />
        )}
        <main
          className={cn(
            'relative min-h-0 flex-1 overflow-auto bg-background-deep',
            preferences.transitionEnable && `admin-transition-${preferences.transitionName}`
          )}
          data-slot="admin-content"
          style={{ padding: preferences.contentPadding }}
        >
          {preferences.transitionProgress && (
            <PageTransitionProgress key={`progress-${activePath}`} routeKey={activePath} />
          )}
          {preferences.transitionLoading && (
            <PageTransitionLoading key={`loading-${activePath}`} routeKey={activePath} />
          )}
          {preferences.appWatermark && preferences.appWatermarkContent && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 opacity-[0.08]"
              style={{
                backgroundImage: `repeating-linear-gradient(-30deg, transparent 0 110px, hsl(var(--foreground)) 110px 112px, transparent 112px 220px)`
              }}
            >
              <div className="grid size-full place-items-center text-2xl font-semibold text-foreground">
                {preferences.appWatermarkContent}
              </div>
            </div>
          )}
          <PageSurface activePath={activePath} key={activePath}>
            {routeAllowed ? undefined : <ForbiddenPage permission={routePermission} />}
          </PageSurface>
        </main>
        {preferences.layout !== 'full-content' && preferences.footerEnable && (
          <footer
            className={cn(
              'flex h-9 shrink-0 items-center justify-center border-t bg-header px-4 text-xs text-muted-foreground',
              preferences.footerFixed && 'sticky bottom-0 z-10'
            )}
          >
            {preferences.copyrightEnable
              ? `Copyright © ${preferences.copyrightDate} ${preferences.copyrightCompanyName}`
              : messages.common.systemName}
          </footer>
        )}
      </SidebarInset>
      {preferencesMounted && (
        <Suspense fallback={null}>
          <PreferencesSheet
            onClearCacheLogout={logout}
            onOpenChange={preferencesActions.set}
            open={preferencesOpen}
            preferences={preferences}
            resetPreferences={preferenceStore.getState().resetPreferences}
            setPreferences={setPreferences}
          />
        </Suspense>
      )}
      {preferencesButtonPlacement.fixed && (
        <button
          aria-label={messages.header.preferences}
          className="fixed top-1/2 right-0 z-50 flex items-center justify-center size-9 -translate-y-1/2 rounded-r-none rounded-l-md bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 cursor-pointer border-0"
          data-preferences-position="fixed"
          onClick={preferencesActions.setTrue}
          type="button"
        >
          <Settings2 className="size-4" />
        </button>
      )}
      {searchMounted && (
        <Suspense fallback={null}>
          <GlobalSearchDialog
            locale={preferences.appLocale}
            menu={activeMenu}
            navigate={navigate}
            onOpenChange={searchActions.set}
            open={searchOpen}
          />
        </Suspense>
      )}
      {lockSetupMounted && (
        <Suspense fallback={null}>
          <LockScreenSetupDialog
            locale={preferences.appLocale}
            onOpenChange={lockActions.set}
            onSubmit={lockScreen}
            open={lockOpen}
          />
        </Suspense>
      )}
      {screenLocked && (
        <Suspense fallback={null}>
          <LockScreenOverlay
            locale={preferences.appLocale}
            onUnlock={unlockScreen}
            password={lockScreenPassword}
            timezone={preferences.appTimezone}
          />
        </Suspense>
      )}
    </SidebarProvider>
  )
}

// 组件：BaseLayout。用于提供管理端基础布局入口、登录守卫和全局提示上下文。
export function BaseLayout() {
  const session = useStore(authStore, state => state.session)

  // 会话被清除（登出、401）时响应式跳转登录页；beforeLoad 不会因 store 变化重跑，因此守卫放组件层。
  if (runtimeEnv.authRequired && !session) {
    return <Navigate replace to="/login" />
  }

  return <AdminWorkspace />
}
