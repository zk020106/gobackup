import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import App from '../App'
import { queryClient } from '@/lib/query-client'
import { preferenceStore } from '@/store/preferences'
import { tabsStore } from '@/store/tabs'

function resizeViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true
  })
  window.dispatchEvent(new Event('resize'))
}

function resetGlobalTabs() {
  tabsStore.setState({
    activeKey: '/overview',
    tabs: [
      { affix: true, icon: 'LayoutDashboard', key: '/overview', path: '/overview', title: '概览' }
    ]
  })
  tabsStore.getState().clearPersistedTabs()
}

async function renderApp() {
  const result = render(<App />)

  await waitFor(() => {
    expect(document.querySelector("[data-slot='admin-content']")).toBeInTheDocument()
  })

  return result
}

describe('admin app shell', () => {
  afterEach(() => {
    cleanup()
    preferenceStore.getState().resetPreferences()
    resetGlobalTabs()
    queryClient.clear()
    resizeViewport(1024)
    window.history.replaceState(null, '', '/')
    window.sessionStorage.clear()
    document.body.style.pointerEvents = ''
    document.body.removeAttribute('data-scroll-locked')
  })

  it('renders the admin shell and opens preferences', async () => {
    preferenceStore.getState().resetPreferences()
    await renderApp()

    expect(screen.getByRole('heading', { name: 'React Admin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '偏好设置' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '侧栏导航' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /工作台/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '偏好设置' }))

    // 偏好设置面板懒加载，首次打开需等待 chunk 转换和解析。
    const preferencesDialog = await screen.findByRole('dialog', { name: '偏好设置' }, { timeout: 5000 })
    expect(preferencesDialog).toBeInTheDocument()
    expect(within(preferencesDialog).getByRole('tab', { name: '外观' })).toBeInTheDocument()
    expect(within(preferencesDialog).getByRole('tab', { name: '布局' })).toBeInTheDocument()
    expect(within(preferencesDialog).getByRole('tab', { name: '快捷键' })).toBeInTheDocument()
    expect(within(preferencesDialog).getByRole('tab', { name: '通用' })).toBeInTheDocument()
    expect(within(preferencesDialog).queryByRole('tab', { name: '拓展' })).not.toBeInTheDocument()
    expect(screen.getByText('主题')).toBeInTheDocument()

    expect(within(preferencesDialog).getByRole('tablist')).toHaveClass('grid')
    expect(within(preferencesDialog).getByRole('tablist')).toHaveClass('sticky')
    expect(within(preferencesDialog).getByRole('tab', { name: '外观' }).closest("[data-slot='tabs']")).toHaveClass(
      'data-[orientation=horizontal]:flex-col'
    )
    expect(within(preferencesDialog).getByRole('tab', { name: '外观' })).toHaveAttribute('data-state', 'active')
    expect(within(preferencesDialog).getByRole('tab', { name: '外观' })).toHaveClass(
      'data-[state=active]:bg-background'
    )
    expect(screen.getByRole('button', { name: '深色' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '深色' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('button', { name: '主题 默认' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: '主题 默认' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('button', { name: '圆角 0.5' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '圆角 0.5' })).toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: '减小字号' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '增大字号' })).toBeInTheDocument()
    expect(screen.getByText('色弱模式')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制偏好设置' })).toBeDisabled()

    await userEvent.click(screen.getByRole('tab', { name: '布局' }))

    expect(screen.getByRole('tab', { name: '布局' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('button', { name: '布局 垂直' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: '布局 双列菜单' })).toBeInTheDocument()
    expect(within(preferencesDialog).getByRole('heading', { name: '导航菜单' })).toBeInTheDocument()
    expect(within(preferencesDialog).getByRole('heading', { name: '界面功能' })).toBeInTheDocument()
    const sidebarToggleRow = within(preferencesDialog).getByText('显示侧栏').closest('div')
    expect(sidebarToggleRow).toHaveClass('my-1')
    const sidebarSwitch = within(sidebarToggleRow!).getByRole('switch')

    expect(sidebarSwitch).toHaveAttribute('aria-checked', 'true')
    expect(sidebarSwitch).toHaveAttribute('data-state', 'checked')
    await userEvent.click(sidebarToggleRow!)
    expect(sidebarSwitch).toHaveAttribute('aria-checked', 'false')
    expect(sidebarSwitch).toHaveAttribute('data-state', 'unchecked')
    await userEvent.click(sidebarSwitch)
    expect(sidebarSwitch).toHaveAttribute('aria-checked', 'true')
    expect(sidebarSwitch).toHaveAttribute('data-state', 'checked')
    expect(within(preferencesDialog).getByText('侧栏按钮')).toBeInTheDocument()
    expect(within(preferencesDialog).queryByText('折叠双列子栏')).not.toBeInTheDocument()
    expect(within(preferencesDialog).queryByText('内容宽度')).not.toBeInTheDocument()
    expect(within(preferencesDialog).queryByText('内容边距')).not.toBeInTheDocument()
    expect(within(preferencesDialog).queryByText('顶部栏高度')).not.toBeInTheDocument()
    expect(within(preferencesDialog).queryByText('双列主栏宽度')).not.toBeInTheDocument()
    expect(within(preferencesDialog).queryByText('标签栏高度')).not.toBeInTheDocument()
    expect(within(preferencesDialog).getByText('持久化标签页')).toBeInTheDocument()
    expect(within(preferencesDialog).getByText('滚轮切换标签')).toBeInTheDocument()
    expect(within(preferencesDialog).getByText('中键关闭标签')).toBeInTheDocument()
    expect(within(preferencesDialog).getByText('偏好设置按钮位置')).toBeInTheDocument()
    expect(within(preferencesDialog).getByText('公司链接')).toBeInTheDocument()
    expect(within(preferencesDialog).getByText('ICP备案号')).toBeInTheDocument()
  })

  it('opens the sidebar menu from the mobile header trigger', async () => {
    preferenceStore.getState().resetPreferences()
    resizeViewport(500)
    await renderApp()

    await userEvent.click(screen.getByRole('button', { name: '打开菜单' }))

    const sidebarDialog = await screen.findByRole('dialog', { name: '侧边栏' })
    const sidebarNavigation = within(sidebarDialog).getByRole('navigation', { name: '侧栏导航' })

    expect(within(sidebarNavigation).getByRole('link', { name: /概览/ })).toBeInTheDocument()
  })

  it('opens a fallback mobile menu for mixed sidebar layouts', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'sidebar-mixed-nav' })
    resizeViewport(500)
    await renderApp()

    await userEvent.click(screen.getByRole('button', { name: '打开菜单' }))

    const sidebarDialog = await screen.findByRole('dialog', { name: '侧边栏' })
    const sidebarNavigation = within(sidebarDialog).getByRole('navigation', { name: '侧栏导航' })

    expect(within(sidebarNavigation).getByRole('button', { name: /组件示例/ })).toBeInTheDocument()
  })

  it('downgrades desktop header and mixed layouts on mobile', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'header-mixed-nav' })
    resizeViewport(500)
    await renderApp()

    expect(screen.queryByRole('navigation', { name: '顶部导航' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '面包屑' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '偏好设置' })).toHaveAttribute(
      'data-preferences-position',
      'fixed'
    )
    expect(screen.queryByRole('button', { name: /浅色模式|深色模式/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '语言' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '时区' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '打开菜单' }))

    const sidebarDialog = await screen.findByRole('dialog', { name: '侧边栏' })
    const sidebarNavigation = within(sidebarDialog).getByRole('navigation', { name: '侧栏导航' })

    expect(within(sidebarNavigation).getByRole('link', { name: /概览/ })).toBeInTheDocument()
    expect(within(sidebarNavigation).getByRole('button', { name: /组件示例/ })).toBeInTheDocument()
  })

  it('renders shortcut and general preference controls', async () => {
    preferenceStore.getState().resetPreferences()
    await renderApp()

    await userEvent.click(screen.getByRole('button', { name: '偏好设置' }))
    await userEvent.click(await screen.findByRole('tab', { name: '快捷键' }, { timeout: 5000 }))

    expect(screen.getByText('启用快捷键')).toBeInTheDocument()
    expect(screen.getByText('Ctrl / ⌘ K')).toBeInTheDocument()
    expect(screen.getByText('Alt L')).toBeInTheDocument()
    expect(screen.getByText('Esc')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '通用' }))

    expect(screen.getByText('语言')).toBeInTheDocument()
    expect(screen.getByText('时区')).toBeInTheDocument()
    expect(screen.getByText('动态标题')).toBeInTheDocument()
    expect(screen.getByText('页面切换动画')).toBeInTheDocument()
    const activeTransitionButton = screen.getByRole('button', { name: /fade-slide/ })

    expect(activeTransitionButton).toHaveAttribute('aria-pressed', 'true')
    expect(activeTransitionButton).toHaveAttribute('data-active', 'true')
    expect(activeTransitionButton).toHaveClass('admin-outline-box-active')
  })

  it('renders menu records in the header when header layout is selected', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'header-nav' })

    await renderApp()

    const headerNavigation = screen.getByRole('navigation', {
      name: '顶部导航'
    })

    expect(headerNavigation).toBeInTheDocument()
    expect(headerNavigation).toHaveTextContent('概览')
    expect(headerNavigation).toHaveTextContent('工作台')
    expect(headerNavigation).toHaveTextContent('组件示例')
    expect(headerNavigation).toHaveTextContent('关于')
    expect(screen.queryByText('管理套件')).not.toBeInTheDocument()
  })

  it('keeps wide content full width and only constrains compact content', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({
      contentCompact: 'wide',
      contentCompactWidth: 1200
    })

    await renderApp()

    const pageSurface = document.querySelector("[data-slot='page-surface']") as HTMLElement

    expect(pageSurface).not.toHaveClass('mx-auto')
    expect(pageSurface.style.maxWidth).toBe('')

    preferenceStore.getState().setPreferences({ contentCompact: 'compact' })

    await waitFor(() => {
      expect(pageSurface).toHaveClass('mx-auto')
      expect(pageSurface.style.maxWidth).toBe('1200px')
    })
  })

  it('keeps the workspace chrome fixed and lets the content area own scrolling', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ footerEnable: true })

    await renderApp()

    const wrapper = document.querySelector("[data-slot='sidebar-wrapper']")
    const inset = document.querySelector("[data-slot='sidebar-inset']")
    const content = document.querySelector("[data-slot='admin-content']")
    const footer = document.querySelector('footer')

    expect(wrapper).toHaveClass('h-svh')
    expect(wrapper).toHaveClass('min-h-0')
    expect(wrapper).toHaveClass('overflow-hidden')
    expect(inset).toHaveClass('min-h-0')
    expect(content).toHaveClass('min-h-0')
    expect(content).toHaveClass('flex-1')
    expect(content).toHaveClass('overflow-auto')
    expect(footer).toHaveClass('shrink-0')
  })

  it('keeps restored sibling tabs when initializing after refresh', async () => {
    preferenceStore.getState().resetPreferences()
    tabsStore.setState({
      activeKey: '/workplace',
      tabs: [
        {
          affix: true,
          icon: 'LayoutDashboard',
          key: '/overview',
          path: '/overview',
          title: '旧概览'
        },
        { key: '/workplace', path: '/workplace', title: '旧工作台' },
        { key: '/about', path: '/about', title: '旧关于' }
      ]
    })
    window.history.replaceState(null, '', '/workplace')

    await renderApp()

    await waitFor(() => {
      expect(
        document.querySelector("[data-slot='page-surface'][data-route-key='/workplace']")
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '工作台' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: '关于' })).toBeInTheDocument()
    expect(tabsStore.getState().tabs.map(tab => tab.key)).toEqual([
      '/overview',
      '/workplace',
      '/about'
    ])
  })

  it('opens the workplace page from the sidebar', async () => {
    preferenceStore.getState().resetPreferences()
    await renderApp()

    const sidebarNavigation = screen.getByRole('navigation', {
      name: '侧栏导航'
    })

    await userEvent.click(within(sidebarNavigation).getByRole('link', { name: /工作台/ }))

    await waitFor(() => {
      expect(
        document.querySelector("[data-slot='page-surface'][data-route-key='/workplace']")
      ).toBeInTheDocument()
    })

    const pageSurface = document.querySelector(
      "[data-slot='page-surface'][data-route-key='/workplace']"
    ) as HTMLElement

    expect((await within(pageSurface).findAllByText('工作台')).length).toBeGreaterThan(0)
    expect(
      within(pageSurface).getAllByText('面向高频后台操作的紧凑任务队列。').length
    ).toBeGreaterThan(0)
    expect(pageSurface.querySelector("[data-slot='page-header']")).toBeInTheDocument()
    expect(pageSurface.querySelectorAll("[data-slot='page-section']")).toHaveLength(2)
    expect(within(pageSurface).getByText('待审批')).toBeInTheDocument()
    expect(await within(pageSurface).findByText('确认工作台数据接入')).toBeInTheDocument()
    expect(within(pageSurface).getByText('活动流')).toBeInTheDocument()
    expect(within(pageSurface).getByText('完成菜单管理权限复核')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '工作台' })).toBeInTheDocument()

    await waitFor(() => {
      expect(document.title).toBe('工作台 - React Admin')
    })
  })

  it('renders header widgets in admin order', async () => {
    preferenceStore.getState().resetPreferences()

    await renderApp()

    const labels = within(screen.getByRole('banner'))
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent)

    expect(labels).toEqual([
      '刷新',
      '搜索',
      '偏好设置',
      '浅色模式',
      '语言',
      '时区',
      '全屏',
      '通知',
      '用户菜单'
    ])
    expect(screen.getByRole('button', { name: '切换侧边栏' })).toBeInTheDocument()
    expect(screen.queryByText('查询状态：缓存已预热')).not.toBeInTheDocument()
  })

  it('opens the data-driven notification center from the header', async () => {
    preferenceStore.getState().resetPreferences()
    await renderApp()

    expect(screen.getByRole('button', { name: /通知|Notifications/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /通知|Notifications/i }))

    expect(await screen.findByText('系统巡检完成')).toBeInTheDocument()
    expect(screen.getByText('权限矩阵已同步')).toBeInTheDocument()
  })

  it('searches workspace users and permissions from the global search dialog', async () => {
    preferenceStore.getState().resetPreferences()
    await renderApp()

    await userEvent.click(screen.getByRole('button', { name: '搜索' }))
    const searchDialog = await screen.findByRole('dialog', { name: '全局搜索' }, { timeout: 5000 })
    const searchInput = within(searchDialog).getByPlaceholderText('搜索路由')

    await userEvent.type(searchInput, 'root@example.com')
    expect(await within(searchDialog).findByText('超级管理员')).toBeInTheDocument()

    await userEvent.clear(searchInput)
    await userEvent.type(searchInput, 'system:user:read')
    expect(await within(searchDialog).findByText('system:user:read')).toBeInTheDocument()
  })

  it('updates locale timezone and lock screen from header controls', async () => {
    preferenceStore.getState().resetPreferences()
    await renderApp()

    await userEvent.click(screen.getByRole('button', { name: '语言' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'English' }))
    expect(preferenceStore.getState().preferences.appLocale).toBe('en-US')
    expect(await screen.findByRole('link', { name: /概览/ })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: '概览' })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.title).toBe('概览 - React Admin')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Timezone' }))
    const timezoneDialog = await screen.findByRole('dialog', { name: 'Set timezone' })
    await userEvent.click(within(timezoneDialog).getByRole('radio', { name: 'UTC' }))
    await userEvent.click(within(timezoneDialog).getByRole('button', { name: 'Confirm' }))
    expect(preferenceStore.getState().preferences.appTimezone).toBe('UTC')

    await userEvent.click(screen.getByRole('button', { name: 'User menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lock screen' }))
    const lockSetupDialog = await screen.findByRole('dialog', { name: 'Lock screen' })
    await userEvent.type(within(lockSetupDialog).getByLabelText('Lock password'), '123456')
    await userEvent.click(within(lockSetupDialog).getByRole('button', { name: 'Lock screen' }))

    const lockScreen = await screen.findByRole('dialog', { name: 'Lock screen' })
    await userEvent.click(within(lockScreen).getByRole('button', { name: 'Unlock' }))
    const unlockPassword = within(lockScreen).getByLabelText('Lock password')

    await userEvent.type(unlockPassword, 'wrong')
    await userEvent.click(within(lockScreen).getByRole('button', { name: 'Enter system' }))
    expect(
      within(lockScreen).getByText('Incorrect password. Please try again.')
    ).toBeInTheDocument()

    await userEvent.clear(unlockPassword)
    await userEvent.type(unlockPassword, '123456')
    await userEvent.click(within(lockScreen).getByRole('button', { name: 'Enter system' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Lock screen' })).not.toBeInTheDocument()
    })
  })

  it('keeps the screen locked after the app remounts', async () => {
    preferenceStore.getState().resetPreferences()
    const { unmount } = await renderApp()

    await userEvent.click(screen.getByRole('button', { name: '用户菜单' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: '锁定屏幕' }))
    const lockSetupDialog = await screen.findByRole('dialog', { name: '锁定屏幕' })
    await userEvent.type(within(lockSetupDialog).getByLabelText('锁屏密码'), '123456')
    await userEvent.click(within(lockSetupDialog).getByRole('button', { name: '锁定屏幕' }))

    expect(await screen.findByRole('dialog', { name: '锁屏界面' })).toBeInTheDocument()

    unmount()
    await renderApp()

    const lockScreen = await screen.findByRole('dialog', { name: '锁屏界面' })
    await userEvent.click(within(lockScreen).getByRole('button', { name: '解锁' }))
    await userEvent.type(within(lockScreen).getByLabelText('锁屏密码'), '123456')
    await userEvent.click(within(lockScreen).getByRole('button', { name: '进入系统' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '锁屏界面' })).not.toBeInTheDocument()
    })
  })

  it('renders about workspace project information', async () => {
    preferenceStore.getState().resetPreferences()
    await renderApp()

    const sidebarNavigation = screen.getByRole('navigation', { name: '侧栏导航' })
    await userEvent.click(within(sidebarNavigation).getByRole('link', { name: /关于/ }))

    expect(await screen.findByText('关于项目')).toBeInTheDocument()
    expect(await screen.findByText('基本信息')).toBeInTheDocument()
    expect(await screen.findByText('生产环境依赖')).toBeInTheDocument()
    expect(await screen.findByText('开发环境依赖')).toBeInTheDocument()
    expect(await screen.findByText('react-admin')).toBeInTheDocument()
    expect(await screen.findByText('@tanstack/react-query')).toBeInTheDocument()
    expect(await screen.findByText('vite')).toBeInTheDocument()
  })

  it('renders sidebar menu groups as collapsible branches', async () => {
    preferenceStore.getState().resetPreferences()

    await renderApp()

    const sidebarNavigation = screen.getByRole('navigation', {
      name: '侧栏导航'
    })
    const effectsTrigger = within(sidebarNavigation).getByRole('button', {
      name: /组件示例/
    })

    expect(effectsTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(
      within(sidebarNavigation).queryByRole('link', { name: /弹窗抽屉/ })
    ).not.toBeInTheDocument()

    await userEvent.click(effectsTrigger)

    expect(effectsTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(sidebarNavigation).getByRole('link', { name: /弹窗抽屉/ })).toBeInTheDocument()
  })

  it('renders nested menu children from the mock menu', async () => {
    preferenceStore.getState().resetPreferences()

    await renderApp()

    const sidebarNavigation = screen.getByRole('navigation', {
      name: '侧栏导航'
    })

    await userEvent.click(within(sidebarNavigation).getByRole('button', { name: /组件示例/ }))
    expect(within(sidebarNavigation).getByRole('link', { name: /弹窗抽屉/ })).toBeInTheDocument()
    expect(within(sidebarNavigation).getByRole('link', { name: /表单控件/ })).toBeInTheDocument()
  })

  it('commits sidebar drag width only after release', async () => {
    preferenceStore.getState().resetPreferences()

    await renderApp()

    const dragHandle = document.querySelector('.cursor-col-resize')

    expect(dragHandle).toBeInTheDocument()
    expect(preferenceStore.getState().preferences.sidebarWidth).toBe(224)

    fireEvent.pointerDown(dragHandle!, { clientX: 224 })
    fireEvent.pointerMove(window, { clientX: 280 })

    expect(preferenceStore.getState().preferences.sidebarWidth).toBe(224)

    fireEvent.pointerUp(window, { clientX: 280 })

    expect(preferenceStore.getState().preferences.sidebarWidth).toBe(280)
  })

  it('only marks the current sidebar route as active', async () => {
    preferenceStore.getState().resetPreferences()

    await renderApp()

    const sidebarNavigation = screen.getByRole('navigation', {
      name: '侧栏导航'
    })

    const activeLink = within(sidebarNavigation).getByRole('link', { name: /概览/ })

    expect(activeLink).toHaveAttribute('data-active', 'true')
    expect(activeLink.className).not.toContain('font-medium')
    expect(activeLink.className).not.toContain('shadow-[inset_3px')
    expect(within(sidebarNavigation).getByRole('link', { name: /关于/ })).not.toHaveAttribute(
      'data-active'
    )
  })

  it('temporarily expands a collapsed sidebar on hover when it is not fixed', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({
      sidebarCollapsed: true,
      sidebarExpandOnHover: false
    })

    await renderApp()

    const sidebar = document.querySelector<HTMLElement>("[data-slot='sidebar']")

    expect(sidebar).toHaveAttribute('data-state', 'collapsed')

    await userEvent.hover(sidebar!)

    await waitFor(() => {
      expect(sidebar).toHaveAttribute('data-hover-expanded', 'true')
      expect(sidebar).toHaveAttribute('data-state', 'expanded')
    })

    await userEvent.unhover(sidebar!)

    await waitFor(() => {
      expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    })
  })

  it('widens the collapsed sidebar rail when collapsed titles are enabled', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({
      sidebarCollapsed: true,
      sidebarCollapsedShowTitle: true
    })

    await renderApp()

    const wrapper = document.querySelector<HTMLElement>("[data-slot='sidebar-wrapper']")

    expect(wrapper).toHaveClass('admin-sidebar-collapsed-show-title')
    expect(wrapper).toHaveStyle('--sidebar-width-icon: 4.25rem')
  })

  it('applies centered layout classes to sidebar header and brand when collapsed', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({
      sidebarCollapsed: true
    })

    await renderApp()

    const sidebar = document.querySelector<HTMLElement>("[data-slot='sidebar']")
    const sidebarHeader = document.querySelector<HTMLElement>("[data-slot='sidebar-header']")
    const sidebarBrand = document.querySelector<HTMLElement>("[data-slot='admin-sidebar-brand']")

    expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    expect(sidebarHeader).toHaveClass('group-data-[collapsible=icon]:justify-center')
    expect(sidebarBrand).toHaveClass('group-data-[collapsible=icon]:justify-center')
    expect(sidebarBrand).toHaveClass('group-data-[collapsible=icon]:px-0')
  })

  it('splits mixed layout into header roots and sidebar children', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'mixed-nav' })

    await renderApp()

    const headerNavigation = screen.getByRole('navigation', {
      name: '顶部导航'
    })
    const headerBrand = document.querySelector("[data-slot='admin-header-inline-brand']")
    const sidebarBrand = document.querySelector("[data-slot='admin-sidebar-brand']")

    expect(headerBrand).not.toBeInTheDocument()
    expect(sidebarBrand).toHaveTextContent('React Admin')
    await userEvent.click(within(headerNavigation).getByRole('button', { name: /组件示例/ }))

    const sidebarNavigation = screen.getByRole('navigation', {
      name: '侧栏导航'
    })

    expect(
      within(headerNavigation).queryByRole('link', { name: /弹窗抽屉/ })
    ).not.toBeInTheDocument()
    expect(within(sidebarNavigation).getByRole('link', { name: /弹窗抽屉/ })).toBeInTheDocument()
    expect(within(sidebarNavigation).queryByRole('link', { name: /概览/ })).not.toBeInTheDocument()

    await userEvent.click(within(headerNavigation).getByRole('button', { name: /关于/ }))

    expect(
      within(sidebarNavigation).queryByRole('link', { name: /弹窗抽屉/ })
    ).not.toBeInTheDocument()
    expect(within(sidebarNavigation).queryByRole('link', { name: /关于/ })).not.toBeInTheDocument()
  })

  it('renders sidebar mixed layout with a rail and secondary menu', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'sidebar-mixed-nav' })

    await renderApp()

    const rootNavigation = screen.getByRole('navigation', {
      name: '混合主导航'
    })

    await userEvent.click(within(rootNavigation).getByRole('button', { name: /组件示例/ }))

    const secondaryNavigation = screen.getByRole('navigation', {
      name: '混合次级导航'
    })

    expect(within(rootNavigation).getByRole('button', { name: /概览/ })).not.toHaveAttribute(
      'data-active',
      'true'
    )
    expect(within(rootNavigation).getByRole('button', { name: /组件示例/ })).toHaveAttribute(
      'data-active',
      'true'
    )
    const extraTitle = document.querySelector("[data-slot='mixed-sidebar-extra-title']")
    expect(extraTitle).toHaveTextContent('React Admin')
    expect(extraTitle?.querySelector('svg')).not.toBeInTheDocument()
    expect(within(secondaryNavigation).getByRole('link', { name: /弹窗抽屉/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '弹窗抽屉' })).not.toBeInTheDocument()
  })

  it('keeps collapsed sidebar mixed secondary menu visible and clickable', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({
      layout: 'sidebar-mixed-nav',
      sidebarExtraCollapsed: true
    })

    await renderApp()

    const rootNavigation = screen.getByRole('navigation', {
      name: '混合主导航'
    })

    await userEvent.click(within(rootNavigation).getByRole('button', { name: /组件示例/ }))

    const secondaryNavigation = screen.getByRole('navigation', {
      name: '混合次级导航'
    })
    const popupMenuItem = within(secondaryNavigation).getByRole('button', { name: /弹窗抽屉/ })

    expect(popupMenuItem).toBeInTheDocument()
    expect(
      within(secondaryNavigation).queryByRole('link', { name: /弹窗抽屉/ })
    ).not.toBeInTheDocument()

    await userEvent.click(popupMenuItem)

    expect(screen.getByRole('tab', { name: '弹窗抽屉' })).toBeInTheDocument()
  })

  it('shows sidebar mixed extra menu on hover when it is not fixed', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({
      layout: 'sidebar-mixed-nav',
      sidebarExpandOnHover: false
    })

    await renderApp()

    const rootNavigation = screen.getByRole('navigation', {
      name: '混合主导航'
    })

    await userEvent.hover(within(rootNavigation).getByRole('button', { name: /组件示例/ }))

    expect(document.querySelector("[data-extra-visible='true']")).toBeInTheDocument()

    const secondaryNavigation = screen.getByRole('navigation', {
      name: '混合次级导航'
    })

    expect(within(secondaryNavigation).getByRole('link', { name: /弹窗抽屉/ })).toBeInTheDocument()
    expect(
      within(secondaryNavigation).queryByRole('link', { name: /概览/ })
    ).not.toBeInTheDocument()

    await userEvent.unhover(within(rootNavigation).getByRole('button', { name: /组件示例/ }))

    expect(document.querySelector("[data-extra-visible='true']")).not.toBeInTheDocument()
  })

  it('renders header mixed layout with header roots and a mixed secondary menu', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'header-mixed-nav' })

    await renderApp()

    const headerNavigation = screen.getByRole('navigation', {
      name: '顶部导航'
    })

    expect(screen.queryByRole('navigation', { name: '混合侧栏导航' })).not.toBeInTheDocument()

    await userEvent.click(within(headerNavigation).getByRole('button', { name: /组件示例/ }))

    const mixedSidebarNavigation = screen.getByRole('navigation', {
      name: '混合侧栏导航'
    })

    expect(
      within(mixedSidebarNavigation).getByRole('button', { name: /弹窗抽屉/ })
    ).toBeInTheDocument()
    expect(
      within(mixedSidebarNavigation).getByRole('button', { name: /表单控件/ })
    ).toBeInTheDocument()
    expect(
      within(mixedSidebarNavigation).queryByRole('button', { name: /概览/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '混合次级导航' })).not.toBeInTheDocument()
    expect(document.querySelector("[data-extra-visible='true']")).not.toBeInTheDocument()

    await userEvent.click(within(mixedSidebarNavigation).getByRole('button', { name: /弹窗抽屉/ }))

    expect(screen.getByRole('tab', { name: '弹窗抽屉' })).toBeInTheDocument()
  })

  it('applies admin header-sidebar layout offset class', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'header-sidebar-nav' })

    await renderApp()

    const header = document.querySelector("[data-slot='admin-header']")
    const headerBrand = document.querySelector("[data-slot='admin-header-inline-brand']")
    const sidebarNavigation = screen.getByRole('navigation', { name: '侧栏导航' })

    expect(header).toHaveTextContent('React Admin')
    expect(headerBrand).toHaveTextContent('React Admin')
    expect(
      document.querySelector("[data-slot='admin-header-sidebar-brand']")
    ).not.toBeInTheDocument()
    expect(within(sidebarNavigation).queryByText('React Admin')).not.toBeInTheDocument()
    expect(document.querySelector("[data-slot='sidebar-wrapper']")).toHaveClass(
      'admin-layout-header-sidebar-nav'
    )
  })

  it('links header brand minimum width to sidebar width in header-sidebar layout', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({
      layout: 'header-sidebar-nav',
      sidebarCollapsed: true,
      sidebarWidth: 260
    })

    await renderApp()

    const wrapper = document.querySelector<HTMLElement>("[data-slot='sidebar-wrapper']")
    const headerBrand = document.querySelector("[data-slot='admin-header-inline-brand']")

    expect(wrapper).toHaveStyle('--admin-sidebar-offset: 3rem')
    expect(wrapper).toHaveStyle('--admin-header-brand-width: 260px')
    expect(headerBrand).toHaveStyle('min-width: var(--admin-header-brand-width)')
    expect(headerBrand).toHaveTextContent('React Admin')
    expect(
      document.querySelector("[data-slot='admin-header-sidebar-brand']")
    ).not.toBeInTheDocument()
  })

  it('does not apply sidebar brand width to header-only navigation', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'header-nav', sidebarWidth: 260 })

    await renderApp()

    const wrapper = document.querySelector<HTMLElement>("[data-slot='sidebar-wrapper']")
    const headerBrand = document.querySelector<HTMLElement>(
      "[data-slot='admin-header-inline-brand']"
    )

    expect(wrapper?.style.getPropertyValue('--admin-header-brand-width')).toBe('')
    expect(headerBrand?.style.minWidth).toBe('')
    expect(headerBrand).toHaveTextContent('React Admin')
  })

  it('limits visible tabs by admin tabbar max count preference', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ tabbarMaxCount: 2 })

    await renderApp()

    const sidebarNavigation = screen.getByRole('navigation', {
      name: '侧栏导航'
    })

    await userEvent.click(within(sidebarNavigation).getByRole('link', { name: /关于/ }))
    await userEvent.click(within(sidebarNavigation).getByRole('link', { name: /工作台/ }))

    expect(screen.getByRole('tab', { name: '工作台' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '关于' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '概览' })).not.toBeInTheDocument()
  })

  it('keeps the active tab visible when admin tabbar max count trims old tabs', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ tabbarMaxCount: 2 })

    await renderApp()

    const sidebarNavigation = screen.getByRole('navigation', {
      name: '侧栏导航'
    })

    await userEvent.click(within(sidebarNavigation).getByRole('link', { name: /关于/ }))
    await userEvent.click(within(sidebarNavigation).getByRole('link', { name: /工作台/ }))
    await userEvent.click(within(sidebarNavigation).getByRole('link', { name: /关于/ }))

    expect(screen.getByRole('tab', { name: '关于' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '工作台' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '概览' })).not.toBeInTheDocument()
  })

  it('hides the native tabbar scrollbar and opens an admin tab context menu', async () => {
    preferenceStore.getState().resetPreferences()
    await renderApp()

    const sidebarNavigation = screen.getByRole('navigation', {
      name: '侧栏导航'
    })

    await userEvent.click(within(sidebarNavigation).getByRole('link', { name: /关于/ }))

    expect(screen.getByRole('tablist')).toHaveClass('admin-tabs-scroll')

    fireEvent.contextMenu(screen.getByRole('tab', { name: '关于' }))

    expect(await screen.findByRole('menuitem', { name: '关闭' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '关闭左侧' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '关闭右侧' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '关闭其他' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '复制路径' })).toBeInTheDocument()
  })

  it('renders full content layout without admin chrome', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'full-content' })

    await renderApp()

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByText('管理套件')).not.toBeInTheDocument()
    expect(screen.getByText('运行概览')).toBeInTheDocument()
  })

  it('places the preferences button as a fixed action when auto mode has no header', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({ layout: 'full-content' })

    await renderApp()

    const preferencesButton = screen.getByRole('button', { name: '偏好设置' })

    expect(preferencesButton).toHaveAttribute('data-preferences-position', 'fixed')
  })

  it('places the preferences action inside the user dropdown when configured', async () => {
    preferenceStore.getState().resetPreferences()
    preferenceStore.getState().setPreferences({
      appPreferencesButtonPosition: 'user-dropdown'
    } as never)

    await renderApp()

    expect(screen.queryByRole('button', { name: '偏好设置' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '用户菜单' }))

    expect(screen.getByRole('menuitem', { name: '偏好设置' })).toHaveAttribute(
      'data-preferences-position',
      'user-dropdown'
    )
  })
})
