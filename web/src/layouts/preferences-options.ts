import { DEFAULT_PREFERENCES } from '@/store/preferences'
import type { AdminPreferences } from '@/types'

/**
 * 偏好设置面板中可选择的圆角预设值。
 *
 * 这些值会写入 `themeRadius`，再由主题系统转换为全局 CSS 圆角变量。
 */
export const preferenceRadiusOptions = ['0', '0.25', '0.5', '0.75', '1']

/**
 * 偏好设置面板中内置的时区选项。
 *
 * 锁屏时间和顶部时区工具会复用这些值，保证展示和配置入口一致。
 */
export const preferenceTimezoneOptions = [
  { label: 'Asia/Shanghai', value: 'Asia/Shanghai' },
  { label: 'UTC', value: 'UTC' },
  { label: 'America/New_York', value: 'America/New_York' },
  { label: 'Europe/London', value: 'Europe/London' }
]

/**
 * 页面切换动画的内置预设。
 *
 * 预设值必须与 `AdminPreferences["transitionName"]` 保持一致。
 */
export const preferenceTransitionOptions: Array<{
  label: string
  value: AdminPreferences['transitionName']
}> = [
  { label: 'fade', value: 'fade' },
  { label: 'fade-slide', value: 'fade-slide' },
  { label: 'fade-up', value: 'fade-up' },
  { label: 'fade-down', value: 'fade-down' }
]

/**
 * 偏好设置入口在当前布局中的展示位置。
 */
export type PreferencesButtonPlacement = {
  /** 是否展示为页面右下角固定按钮。 */
  fixed: boolean
  /** 是否展示在顶部栏工具区。 */
  header: boolean
  /** 是否展示在用户菜单内。 */
  userDropdown: boolean
}

/**
 * 根据布局、设备类型和侧栏/顶栏可见性计算偏好设置入口位置。
 *
 * @param options.headerEnabled - 当前布局是否显示顶栏。
 * @param options.isMobile - 当前视口是否为移动端。
 * @param options.preferences - 当前后台偏好设置。
 * @param options.sidebarEnabled - 当前布局是否显示侧栏。
 * @returns 偏好设置入口在固定按钮、顶栏或用户菜单中的展示状态。
 */
export function resolvePreferencesButtonPlacement({
  headerEnabled,
  isMobile,
  preferences,
  sidebarEnabled
}: {
  headerEnabled: boolean
  isMobile: boolean
  preferences: AdminPreferences
  sidebarEnabled: boolean
}): PreferencesButtonPlacement {
  const position = preferences.appPreferencesButtonPosition

  if (position !== 'auto') {
    return {
      fixed: position === 'fixed',
      header: position === 'header',
      userDropdown: position === 'user-dropdown'
    }
  }

  const contentIsMaximized = !headerEnabled && !sidebarEnabled
  const fixed =
    contentIsMaximized || preferences.layout === 'full-content' || isMobile || !headerEnabled

  return {
    fixed,
    header: !fixed,
    userDropdown: false
  }
}

/**
 * 提取当前偏好设置与默认值之间的差异。
 *
 * @param preferences - 当前完整偏好设置对象。
 * @returns 只包含被用户修改过的偏好设置字段。
 */
export function getPreferenceDiff(preferences: AdminPreferences): Partial<AdminPreferences> {
  const diff: Partial<AdminPreferences> = {}

  ;(Object.keys(DEFAULT_PREFERENCES) as Array<keyof AdminPreferences>).forEach(key => {
    if (preferences[key] !== DEFAULT_PREFERENCES[key]) {
      diff[key] = preferences[key] as never
    }
  })

  return diff
}
