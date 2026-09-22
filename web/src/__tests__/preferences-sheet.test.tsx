import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { preferenceStore } from '@/store/preferences'

async function openPreferences() {
  render(<App />)
  await waitFor(() => {
    expect(document.querySelector("[data-slot='sidebar-wrapper']")).toBeInTheDocument()
  })
  await userEvent.click(screen.getByRole('button', { name: '偏好设置' }))
  // 偏好设置面板懒加载，首次打开需等待 chunk 转换和解析。
  return await screen.findByRole('dialog', { name: '偏好设置' }, { timeout: 5000 })
}

async function openPreferencesTab(name: string) {
  const dialog = await openPreferences()
  await userEvent.click(within(dialog).getByRole('tab', { name }))
  return dialog
}

async function chooseSelect(label: string, option: string) {
  const dialog = screen.getByRole('dialog', { name: /偏好设置|Preferences/ })
  const labelEl = within(dialog).getByText(label)
  const container = labelEl.closest('div')
  const trigger = (container?.querySelector('.semi-select-selection') ??
    container?.querySelector('[role="combobox"]') ??
    container?.querySelector('.semi-select')) as HTMLElement
  fireEvent.click(trigger)
  const optionText = await screen.findByText(option)
  const optionEl = (optionText.closest('[role="option"]') ?? optionText) as HTMLElement
  fireEvent.click(optionEl)
}

function preferences() {
  return preferenceStore.getState().preferences
}

function clipboardWriteTextMock() {
  const writeText = Object.getOwnPropertyDescriptor(navigator.clipboard, 'writeText')
    ?.value as typeof navigator.clipboard.writeText

  return vi.mocked(writeText)
}

describe('preferences sheet interactions', () => {
  afterEach(() => {
    cleanup()
    preferenceStore.getState().resetPreferences()
    window.localStorage.clear()
    window.history.replaceState(null, '', '/')
    document.body.style.pointerEvents = ''
    document.body.removeAttribute('data-scroll-locked')
    clipboardWriteTextMock().mockClear()
  })

  it('updates appearance preferences', async () => {
    const dialog = await openPreferences()

    await userEvent.click(within(dialog).getByRole('button', { name: '浅色' }))
    expect(preferences().colorMode).toBe('light')

    await userEvent.click(within(dialog).getByText('深色侧边栏'))
    expect(preferences().themeSemiDarkSidebar).toBe(true)

    await userEvent.click(within(dialog).getByText('深色侧边栏子栏'))
    expect(preferences().themeSemiDarkSidebarSub).toBe(true)

    await userEvent.click(within(dialog).getByText('深色顶栏'))
    expect(preferences().themeSemiDarkHeader).toBe(true)

    await userEvent.click(within(dialog).getByRole('button', { name: '主题 绿色' }))
    expect(preferences().themeBuiltinType).toBe('green')

    await userEvent.click(within(dialog).getByRole('button', { name: '圆角 1' }))
    expect(preferences().themeRadius).toBe('1')

    await userEvent.click(within(dialog).getByRole('button', { name: '增大字号' }))
    expect(preferences().themeFontSize).toBe(17)

    await userEvent.click(within(dialog).getByText('色弱模式'))
    await userEvent.click(within(dialog).getByText('灰色模式'))
    expect(preferences()).toEqual(
      expect.objectContaining({
        colorGrayMode: true,
        colorWeakMode: true
      })
    )
  })

  it('updates layout sidebar header navigation and breadcrumb preferences', async () => {
    const dialog = await openPreferencesTab('布局')

    await userEvent.click(within(dialog).getByRole('button', { name: '布局 混合垂直' }))
    expect(preferences().layout).toBe('mixed-nav')

    await userEvent.click(within(dialog).getByRole('button', { name: '内容 紧凑' }))
    expect(preferences().contentCompact).toBe('compact')

    await userEvent.click(within(dialog).getByText('默认折叠'))
    await userEvent.click(within(dialog).getByText('鼠标悬停展开'))
    await userEvent.click(within(dialog).getByText('折叠时显示标题'))
    await userEvent.click(within(dialog).getByText('自动激活子菜单'))
    await userEvent.click(within(dialog).getByRole('button', { name: '折叠按钮' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '固定按钮' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '增大侧栏宽度' }))
    await userEvent.click(within(dialog).getByText('允许拖拽宽度'))
    await userEvent.click(within(dialog).getByText('显示侧栏'))
    expect(preferences()).toEqual(
      expect.objectContaining({
        sidebarAutoActivateChild: true,
        sidebarCollapsed: true,
        sidebarCollapsedButton: false,
        sidebarCollapsedShowTitle: true,
        sidebarDraggable: false,
        sidebarEnable: false,
        sidebarExpandOnHover: false,
        sidebarFixedButton: false,
        sidebarWidth: 234
      })
    )

    await chooseSelect('显示模式', '滚动隐藏')
    await userEvent.click(within(dialog).getByRole('button', { name: '中' }))
    await userEvent.click(within(dialog).getByText('显示顶部栏'))
    expect(preferences()).toEqual(
      expect.objectContaining({
        headerMenuAlign: 'center',
        headerMode: 'auto-scroll',
        headerVisible: false
      })
    )

    await userEvent.click(within(dialog).getByRole('button', { name: '朴素' }))
    await userEvent.click(within(dialog).getByText('切割菜单'))
    await userEvent.click(within(dialog).getByText('手风琴模式'))
    expect(preferences()).toEqual(
      expect.objectContaining({
        navigationAccordion: false,
        navigationSplit: false,
        navigationStyleType: 'plain'
      })
    )

    await userEvent.click(within(dialog).getByRole('button', { name: '布局 垂直' }))
    await userEvent.click(within(dialog).getByText('仅一个时隐藏'))
    await userEvent.click(within(dialog).getByText('显示图标'))
    await userEvent.click(within(dialog).getByText('显示首页'))
    await userEvent.click(within(dialog).getByRole('button', { name: '背景' }))
    await userEvent.click(within(dialog).getByText('显示面包屑'))
    expect(preferences()).toEqual(
      expect.objectContaining({
        breadcrumbEnable: false,
        breadcrumbHideOnlyOne: true,
        breadcrumbShowHome: true,
        breadcrumbShowIcon: false,
        breadcrumbStyleType: 'background'
      })
    )
  })

  it('updates tabbar preferences', async () => {
    const dialog = await openPreferencesTab('布局')

    await userEvent.click(within(dialog).getByText('显示标签图标'))
    await userEvent.click(within(dialog).getByText('持久化标签页'))
    await userEvent.click(within(dialog).getByText('访问历史'))
    await userEvent.click(within(dialog).getByText('允许拖拽排序'))
    await userEvent.click(within(dialog).getByText('滚轮切换标签'))
    await userEvent.click(within(dialog).getByText('中键关闭标签'))
    await userEvent.click(within(dialog).getByText('显示更多按钮'))
    await userEvent.click(within(dialog).getByText('显示刷新按钮'))
    await userEvent.click(within(dialog).getByText('显示最大化按钮'))
    await chooseSelect('标签页风格', '卡片')
    await userEvent.click(within(dialog).getByRole('button', { name: '增大最大标签数' }))
    await userEvent.click(within(dialog).getByText('显示标签页'))
    expect(preferences()).toEqual(
      expect.objectContaining({
        tabbarDraggable: false,
        tabbarEnable: false,
        tabbarMaxCount: 5,
        tabbarMiddleClickToClose: true,
        tabbarPersist: false,
        tabbarShowIcon: false,
        tabbarShowMaximize: false,
        tabbarShowMore: false,
        tabbarShowRefresh: false,
        tabbarStyleType: 'card',
        tabbarVisitHistory: false,
        tabbarWheelable: false
      })
    )
  })

  it('updates header widget preferences', async () => {
    const dialog = await openPreferencesTab('布局')

    await userEvent.click(within(dialog).getByText('全局搜索'))
    await userEvent.click(within(dialog).getByText('主题切换'))
    await userEvent.click(within(dialog).getByText('语言切换'))
    await userEvent.click(within(dialog).getByText('全屏按钮'))
    await userEvent.click(within(dialog).getByText('通知按钮'))
    await userEvent.click(within(dialog).getByText('锁屏按钮'))
    await userEvent.click(within(dialog).getByText('侧栏折叠按钮'))
    await userEvent.click(within(dialog).getByText('刷新按钮'))
    await userEvent.click(within(dialog).getByText('时区按钮'))
    await chooseSelect('偏好设置按钮位置', '用户下拉菜单')
    expect(preferences()).toEqual(
      expect.objectContaining({
        appPreferencesButtonPosition: 'user-dropdown',
        widgetFullscreen: false,
        widgetGlobalSearch: false,
        widgetLanguageToggle: false,
        widgetLockScreen: false,
        widgetNotification: false,
        widgetRefresh: false,
        widgetSidebarToggle: false,
        widgetThemeToggle: false,
        widgetTimezone: false
      })
    )
  })

  it('updates footer and copyright preferences', async () => {
    const dialog = await openPreferencesTab('布局')

    await userEvent.click(within(dialog).getByText('显示页脚'))
    await userEvent.click(within(dialog).getByText('固定页脚'))
    await userEvent.clear(within(dialog).getByRole('textbox', { name: '公司名称' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: '公司名称' }), 'ACME')
    await userEvent.clear(within(dialog).getByRole('textbox', { name: '公司链接' }))
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: '公司链接' }),
      'https://example.com'
    )
    await userEvent.clear(within(dialog).getByRole('textbox', { name: '版权年份' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: '版权年份' }), '2026')
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'ICP备案号' }),
      '沪ICP备00000000号'
    )
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'ICP备案链接' }),
      'https://beian.example.com'
    )
    expect(preferences()).toEqual(
      expect.objectContaining({
        copyrightCompanyName: 'ACME',
        copyrightCompanySiteLink: 'https://example.com',
        copyrightDate: '2026',
        copyrightEnable: true,
        copyrightIcp: '沪ICP备00000000号',
        copyrightIcpLink: 'https://beian.example.com',
        footerEnable: true,
        footerFixed: true
      })
    )
  })

  it('updates shortcut preferences', async () => {
    const dialog = await openPreferencesTab('快捷键')

    await userEvent.click(within(dialog).getByText('全局搜索'))
    await userEvent.click(within(dialog).getByText('退出登录'))
    await userEvent.click(within(dialog).getByText('锁定屏幕'))
    await userEvent.click(within(dialog).getByText('Esc 关闭弹层'))
    await userEvent.click(within(dialog).getByText('启用快捷键'))

    expect(preferences()).toEqual(
      expect.objectContaining({
        shortcutKeysEnable: false,
        shortcutKeysGlobalEscape: true,
        shortcutKeysGlobalLockScreen: false,
        shortcutKeysGlobalLogout: false,
        shortcutKeysGlobalSearch: false
      })
    )
  })

  it('updates general preferences and sheet actions', async () => {
    const dialog = await openPreferencesTab('通用')

    await chooseSelect('语言', 'English')
    await chooseSelect('Timezone', 'UTC')
    await userEvent.click(within(dialog).getByText('Dynamic title'))
    await userEvent.click(within(dialog).getByText('Watermark'))
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Watermark content' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Watermark content' }), 'Demo')
    await userEvent.click(within(dialog).getByText('Enable update checks'))
    await userEvent.click(within(dialog).getByText('Page loading progress'))
    await userEvent.click(within(dialog).getByText('Page loading'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Animation fade-up' }))
    await userEvent.click(within(dialog).getByText('Page transition animation'))

    expect(preferences()).toEqual(
      expect.objectContaining({
        animationEnable: false,
        appDynamicTitle: false,
        appEnableCheckUpdates: false,
        appLocale: 'en-US',
        appTimezone: 'UTC',
        appWatermark: true,
        appWatermarkContent: 'Demo',
        transitionEnable: false,
        transitionLoading: false,
        transitionName: 'fade-up',
        transitionProgress: false
      })
    )

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Unpin preferences navigation' })
    )
    expect(preferences().appEnableStickyPreferencesNavigationBar).toBe(false)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy preferences' }))
    expect(clipboardWriteTextMock()).toHaveBeenCalledWith(
      expect.stringContaining('"appLocale": "en-US"')
    )

    await userEvent.click(within(dialog).getByText('Allow copying preferences'))
    expect(preferences().appEnableCopyPreferences).toBe(false)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset preferences' }))
    expect(preferences()).toEqual(expect.objectContaining({ appLocale: 'zh-CN' }))
  })
})
