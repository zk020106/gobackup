import { createStore } from 'zustand/vanilla'

import type {
  AdminPreferences,
  LayoutMode,
  PreferencesButtonPosition,
  TransitionName
} from '@/types'

export const DEFAULT_PREFERENCES: AdminPreferences = {
  animationEnable: true,
  appDynamicTitle: true,
  appEnableCheckUpdates: true,
  appEnableCopyPreferences: true,
  appEnableStickyPreferencesNavigationBar: true,
  appLocale: 'zh-CN',
  appPreferencesButtonPosition: 'auto',
  appTimezone: 'Asia/Shanghai',
  appWatermark: false,
  appWatermarkContent: '',
  colorGrayMode: false,
  colorWeakMode: false,
  breadcrumbEnable: true,
  breadcrumbHideOnlyOne: false,
  breadcrumbShowHome: false,
  breadcrumbShowIcon: true,
  breadcrumbStyleType: 'normal',
  colorMode: 'dark',
  contentCompact: 'wide',
  contentCompactWidth: 1200,
  contentPadding: 0,
  copyrightCompanyName: 'GoBackup',
  copyrightCompanySiteLink: 'https://github.com/gobackup/gobackup',
  copyrightDate: '2024',
  copyrightEnable: true,
  copyrightIcp: '',
  copyrightIcpLink: '',
  footerEnable: false,
  footerFixed: false,
  headerHeight: 50,
  headerMenuAlign: 'start',
  headerMode: 'fixed',
  headerVisible: true,
  layout: 'sidebar-nav',
  navigationAccordion: true,
  navigationSplit: true,
  navigationStyleType: 'rounded',
  shortcutKeysEnable: true,
  shortcutKeysGlobalEscape: false,
  shortcutKeysGlobalLockScreen: true,
  shortcutKeysGlobalLogout: true,
  shortcutKeysGlobalSearch: true,
  sidebarAutoActivateChild: false,
  sidebarCollapsed: false,
  sidebarCollapsedButton: true,
  sidebarCollapsedShowTitle: false,
  sidebarDraggable: true,
  sidebarEnable: true,
  sidebarExtraCollapsed: false,
  sidebarExpandOnHover: true,
  sidebarFixedButton: true,
  sidebarHidden: false,
  sidebarMixedWidth: 80,
  sidebarWidth: 224,
  tabbarEnable: true,
  tabbarDraggable: true,
  tabbarHeight: 38,
  tabbarMaxCount: 0,
  tabbarMiddleClickToClose: false,
  tabbarPersist: true,
  tabbarShowIcon: true,
  tabbarShowMaximize: true,
  tabbarShowMore: true,
  tabbarShowRefresh: true,
  tabbarStyleType: 'chrome',
  tabbarVisitHistory: true,
  tabbarWheelable: true,
  themeBuiltinType: 'default',
  themeColorDestructive: 'hsl(0 72% 51%)',
  themeColorPrimary: '#1d6fee',
  themeColorSuccess: 'hsl(158 64% 52%)',
  themeColorWarning: 'hsl(38 92% 50%)',
  themeFontSize: 16,
  themeRadius: '0.5',
  themeSemiDarkHeader: false,
  themeSemiDarkSidebar: false,
  themeSemiDarkSidebarSub: false,
  transitionEnable: true,
  transitionLoading: false,
  transitionName: 'fade-slide',
  transitionProgress: true,
  widgetFullscreen: true,
  widgetGlobalSearch: true,
  widgetLanguageToggle: true,
  widgetLockScreen: true,
  widgetNotification: true,
  widgetRefresh: true,
  widgetSidebarToggle: true,
  widgetThemeToggle: true,
  widgetTimezone: true
}

const LAYOUTS = new Set<LayoutMode>([
  'full-content',
  'header-mixed-nav',
  'header-nav',
  'header-sidebar-nav',
  'mixed-nav',
  'sidebar-mixed-nav',
  'sidebar-nav'
])

const TRANSITIONS = new Set<TransitionName>(['fade', 'fade-down', 'fade-slide', 'fade-up'])
const PREFERENCES_BUTTON_POSITIONS = new Set<PreferencesButtonPosition>([
  'auto',
  'fixed',
  'header',
  'user-dropdown'
])

export interface PreferenceStoreState {
  preferences: AdminPreferences
  // 方法：resetPreferences。把偏好设置恢复为默认值。
  resetPreferences: () => void
  // 方法：setPreferences。合并局部偏好设置并触发持久化。
  setPreferences: (
    updater:
      | ((preferences: AdminPreferences) => Partial<AdminPreferences>)
      | Partial<AdminPreferences>
  ) => void
}

interface PreferenceStoreOptions {
  persist?: boolean
  storageKey?: string
}

const PREFERENCES_STORAGE_KEY = 'gobackup:preferences'
const PREFERENCES_STORAGE_VERSION = 1

// 函数：clamp。把数值限制在给定范围内。
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

// 函数：getLocalStorage。安全获取浏览器 localStorage。
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

// 函数：readStoredPreferences。读取并兼容旧结构的偏好设置缓存。
function readStoredPreferences(storageKey: string): Partial<AdminPreferences> | undefined {
  const storage = getLocalStorage()

  if (!storage) {
    return undefined
  }

  try {
    const raw = storage.getItem(storageKey)

    if (!raw) {
      return undefined
    }

    const parsed = JSON.parse(raw) as unknown

    if (parsed && typeof parsed === 'object' && 'preferences' in parsed) {
      return (parsed as { preferences?: Partial<AdminPreferences> }).preferences
    }

    if (parsed && typeof parsed === 'object') {
      return parsed as Partial<AdminPreferences>
    }
  } catch {
    storage.removeItem(storageKey)
  }

  return undefined
}

// 函数：diffFromDefaultPreferences。只保留与默认值不同的键，最小化本地存储体积。
function diffFromDefaultPreferences(preferences: AdminPreferences): Partial<AdminPreferences> {
  const diff: Partial<AdminPreferences> = {}

  for (const key of Object.keys(preferences) as (keyof AdminPreferences)[]) {
    if (preferences[key] !== DEFAULT_PREFERENCES[key]) {
      ;(diff as Record<keyof AdminPreferences, unknown>)[key] = preferences[key]
    }
  }

  return diff
}

// 函数：writeStoredPreferences。把与默认值的差异写入本地存储。
function writeStoredPreferences(storageKey: string, preferences: AdminPreferences) {
  const storage = getLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(
      storageKey,
      JSON.stringify({
        preferences: diffFromDefaultPreferences(preferences),
        version: PREFERENCES_STORAGE_VERSION
      })
    )
  } catch {
    // 忽略存储配额或隐私模式失败，内存状态仍可继续工作。
  }
}

// 函数：normalizePreferences。合并并校正偏好设置，避免非法值进入布局。
export function normalizePreferences(
  next: Partial<AdminPreferences> = {},
  base: AdminPreferences = DEFAULT_PREFERENCES
): AdminPreferences {
  const merged = { ...base, ...next }

  // 约束持久化或导入值，避免无效 localStorage 数据破坏布局。
  return {
    ...merged,
    contentCompactWidth: clamp(merged.contentCompactWidth, 960, 1680),
    contentPadding: clamp(merged.contentPadding, 0, 48),
    headerHeight: clamp(merged.headerHeight, 40, 80),
    layout: LAYOUTS.has(merged.layout) ? merged.layout : DEFAULT_PREFERENCES.layout,
    appPreferencesButtonPosition: PREFERENCES_BUTTON_POSITIONS.has(
      merged.appPreferencesButtonPosition
    )
      ? merged.appPreferencesButtonPosition
      : DEFAULT_PREFERENCES.appPreferencesButtonPosition,
    sidebarMixedWidth: clamp(merged.sidebarMixedWidth, 60, 120),
    sidebarWidth: clamp(merged.sidebarWidth, 160, 320),
    tabbarHeight: clamp(merged.tabbarHeight, 28, 56),
    tabbarMaxCount: clamp(merged.tabbarMaxCount, 0, 50),
    themeFontSize: clamp(merged.themeFontSize, 15, 22),
    themeRadius: String(clamp(Number(merged.themeRadius), 0, 1.5)),
    transitionName: TRANSITIONS.has(merged.transitionName)
      ? merged.transitionName
      : DEFAULT_PREFERENCES.transitionName
  }
}

// 函数：createPreferenceStore。创建偏好设置仓库并按需接入本地持久化。
export function createPreferenceStore(
  initial?: Partial<AdminPreferences>,
  options: PreferenceStoreOptions = {}
) {
  const storageKey = options.storageKey ?? PREFERENCES_STORAGE_KEY
  const persisted = options.persist ? readStoredPreferences(storageKey) : undefined
  // 显式初始值优先于持久化状态，方便隔离测试和预览。
  const initialPreferences = normalizePreferences({ ...persisted, ...initial })

  return createStore<PreferenceStoreState>()((set, get) => ({
    preferences: initialPreferences,
    resetPreferences: () => {
      set({ preferences: DEFAULT_PREFERENCES })

      if (options.persist) {
        writeStoredPreferences(storageKey, DEFAULT_PREFERENCES)
      }
    },
    setPreferences: updater => {
      const current = get().preferences
      const patch = typeof updater === 'function' ? updater(current) : updater
      const preferences = normalizePreferences(patch, current)

      set({ preferences })

      if (options.persist) {
        writeStoredPreferences(storageKey, preferences)
      }
    }
  }))
}

export const preferenceStore = createPreferenceStore(undefined, { persist: true })
