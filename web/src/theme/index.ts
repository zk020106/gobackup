import { TinyColor } from '@ctrl/tinycolor'

export type BuiltinThemeType =
  | 'custom'
  | 'cyber-blue'
  | 'deep-blue'
  | 'deep-green'
  | 'default'
  | 'gray'
  | 'green'
  | 'neutral'
  | 'orange'
  | 'pink'
  | 'rose'
  | 'sky-blue'
  | 'slate'
  | 'violet'
  | 'yellow'
  | 'zinc'

export type AdminThemeMode = 'auto' | 'dark' | 'light'

export interface BuiltinThemePreset {
  color: string
  darkPrimaryColor?: string
  primaryColor?: string
  type: BuiltinThemeType
}

export interface AdminThemeOptions {
  builtinType: BuiltinThemeType
  colorDestructive?: string
  colorPrimary?: string
  colorSuccess?: string
  colorWarning?: string
  fontSize: number
  mode: AdminThemeMode
  radius: string
  semiDarkHeader?: boolean
  semiDarkSidebar?: boolean
  semiDarkSidebarSub?: boolean
}

export const BUILT_IN_THEME_PRESETS: BuiltinThemePreset[] = [
  {
    color: '#3b82f6',
    darkPrimaryColor: '#3b82f6',
    primaryColor: '#1d6fee',
    type: 'default'
  },
  {
    color: '#3b82f6',
    darkPrimaryColor: '#3b82f6',
    primaryColor: '#1d6fee',
    type: 'cyber-blue'
  },
  {
    color: 'hsl(262 83% 58%)',
    darkPrimaryColor: 'hsl(263 70% 68%)',
    primaryColor: 'hsl(262 83% 58%)',
    type: 'violet'
  },
  {
    color: 'hsl(346 77% 50%)',
    darkPrimaryColor: 'hsl(346 84% 65%)',
    primaryColor: 'hsl(346 77% 50%)',
    type: 'pink'
  },
  {
    color: 'hsl(38 92% 50%)',
    darkPrimaryColor: 'hsl(42 84% 61%)',
    primaryColor: 'hsl(38 92% 50%)',
    type: 'yellow'
  },
  {
    color: 'hsl(199 89% 48%)',
    darkPrimaryColor: 'hsl(199 89% 58%)',
    primaryColor: 'hsl(199 89% 48%)',
    type: 'sky-blue'
  },
  {
    color: 'hsl(158 64% 40%)',
    darkPrimaryColor: 'hsl(158 64% 52%)',
    primaryColor: 'hsl(158 64% 40%)',
    type: 'green'
  },
  {
    color: 'hsl(240 5% 26%)',
    darkPrimaryColor: 'hsl(0 0% 98%)',
    primaryColor: 'hsl(240 5.9% 10%)',
    type: 'zinc'
  },
  {
    color: 'hsl(173 80% 36%)',
    darkPrimaryColor: 'hsl(173 80% 48%)',
    primaryColor: 'hsl(173 80% 36%)',
    type: 'deep-green'
  },
  {
    color: 'hsl(221 83% 53%)',
    darkPrimaryColor: 'hsl(217 91% 60%)',
    primaryColor: 'hsl(221 83% 53%)',
    type: 'deep-blue'
  },
  {
    color: 'hsl(24 95% 46%)',
    darkPrimaryColor: 'hsl(24 95% 58%)',
    primaryColor: 'hsl(24 95% 46%)',
    type: 'orange'
  },
  {
    color: 'hsl(346 77% 48%)',
    darkPrimaryColor: 'hsl(346 77% 62%)',
    primaryColor: 'hsl(346 77% 48%)',
    type: 'rose'
  },
  {
    color: 'hsl(0 0% 25%)',
    darkPrimaryColor: 'hsl(0 0% 98%)',
    primaryColor: 'hsl(240 5.9% 10%)',
    type: 'neutral'
  },
  {
    color: 'hsl(215 25% 40%)',
    darkPrimaryColor: 'hsl(213 94% 68%)',
    primaryColor: 'hsl(215 25% 40%)',
    type: 'slate'
  },
  {
    color: 'hsl(217 19% 38%)',
    darkPrimaryColor: 'hsl(217 19% 70%)',
    primaryColor: 'hsl(217 19% 38%)',
    type: 'gray'
  },
  { color: '', type: 'custom' }
]

// 函数：isDarkTheme。根据主题模式判断当前是否应使用暗色主题。
export function isDarkTheme(mode: AdminThemeMode) {
  if (mode === 'auto') {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  return mode === 'dark'
}

/**
 * 解析并生成 Semi Design 全套圆角 CSS 变量映射。
 *
 * Semi Design 组件圆角消费约定：
 * - small: Button (按钮)、Input (输入框)、Select (选择器)、Tag (标签)、ButtonGroup
 * - extra-small: 微型指示器、微型标签
 * - medium: Card (卡片)、Dropdown (下拉菜单)、Tooltip (文字提示)、Popover (气泡卡片)
 * - large: Modal (弹窗内容区)、SideSheet (抽屉)
 *
 * @param radiusRem - 主题配置中的圆角字符串（如 '0', '0.25', '0.5', '0.75', '1'）
 */
export function resolveSemiRadiusTokens(radiusRem: string): Record<string, string> {
  const r = parseFloat(radiusRem)
  if (r === 0) {
    return {
      '--semi-border-radius-extra-small': '0px',
      '--semi-border-radius-small': '0px',
      '--semi-border-radius-medium': '0px',
      '--semi-border-radius-large': '0px'
    }
  }

  return {
    '--semi-border-radius-extra-small': `calc(${radiusRem}rem * 0.5)`,
    '--semi-border-radius-small': `${radiusRem}rem`,
    '--semi-border-radius-medium': `calc(${radiusRem}rem * 1.25)`,
    '--semi-border-radius-large': `calc(${radiusRem}rem * 1.75)`
  }
}

/**
 * 解析并生成 Semi Design 完整的状态色阶与交互色彩 Token。
 */
export function resolveSemiColorTokens(
  options: AdminThemeOptions,
  primaryColorHex: string,
  dark: boolean
): Record<string, string> {
  const primary = new TinyColor(primaryColorHex)
  const hexPrimary = primary.toHexString()

  const hoverColor = dark ? primary.lighten(8).toHexString() : primary.darken(6).toHexString()
  const activeColor = dark ? primary.lighten(15).toHexString() : primary.darken(12).toHexString()
  const disabledColor = dark
    ? primary.setAlpha(0.35).toRgbString()
    : primary.lighten(30).toHexString()
  const lightDefaultColor = primary.setAlpha(dark ? 0.18 : 0.1).toRgbString()
  const lightHoverColor = primary.setAlpha(dark ? 0.28 : 0.2).toRgbString()
  const lightActiveColor = primary.setAlpha(dark ? 0.38 : 0.3).toRgbString()

  const tokens: Record<string, string> = {
    '--semi-color-primary': hexPrimary,
    '--semi-color-primary-hover': hoverColor,
    '--semi-color-primary-active': activeColor,
    '--semi-color-primary-disabled': disabledColor,
    '--semi-color-primary-light-default': lightDefaultColor,
    '--semi-color-primary-light-hover': lightHoverColor,
    '--semi-color-primary-light-active': lightActiveColor,
    '--semi-color-focus-border': hexPrimary,
    '--semi-color-link': hexPrimary,
    '--semi-color-link-hover': hoverColor,
    '--semi-color-link-active': activeColor,

    // Linear / Vercel 极简石墨底色与文本对齐
    '--semi-color-bg-0': dark ? '#09090b' : '#ffffff',
    '--semi-color-bg-1': dark ? '#141416' : '#ffffff',
    '--semi-color-bg-2': dark ? '#1e1e22' : '#f4f4f6',
    '--semi-color-bg-3': dark ? '#27272a' : '#e4e4e7',
    '--semi-color-bg-4': dark ? '#3f3f46' : '#d4d4d8',
    '--semi-color-text-0': dark ? '#fafafa' : '#09090b',
    '--semi-color-text-1': dark ? '#a1a1aa' : '#71717a',
    '--semi-color-text-2': dark ? '#71717a' : '#a1a1aa',
    '--semi-color-text-3': dark ? '#52525b' : '#d4d4d8',
    '--semi-color-border': dark ? 'rgba(255, 255, 255, 0.08)' : '#e4e4e7',
    '--semi-color-nav-bg': dark ? '#09090b' : '#ffffff',

    // Semi Design 官方调色板 Token 深度覆盖 (供 Tag / Badge / 状态组件消费)
    '--semi-green-5': dark ? '52, 211, 153' : '16, 185, 129',
    '--semi-green-8': dark ? '110, 231, 183' : '4, 120, 87',
    '--semi-blue-5': dark ? '96, 165, 250' : '59, 130, 246',
    '--semi-blue-8': dark ? '147, 197, 253' : '29, 78, 216',
    '--semi-red-5': dark ? '248, 113, 113' : '239, 68, 68',
    '--semi-red-8': dark ? '252, 165, 165' : '185, 28, 28',
    '--semi-amber-5': dark ? '251, 191, 36' : '245, 158, 11',
    '--semi-amber-8': dark ? '253, 224, 71' : '180, 83, 9',
    '--semi-orange-5': dark ? '251, 146, 60' : '249, 115, 22',
    '--semi-orange-8': dark ? '253, 186, 116' : '194, 65, 12',
    '--semi-purple-5': dark ? '192, 132, 252' : '168, 85, 247',
    '--semi-purple-8': dark ? '216, 180, 254' : '107, 33, 168',
    '--semi-grey-5': dark ? '161, 161, 170' : '113, 113, 122',
    '--semi-grey-8': dark ? '228, 228, 231' : '39, 39, 42'
  }

  if (options.colorSuccess) {
    const success = new TinyColor(options.colorSuccess)
    tokens['--semi-color-success'] = success.toHexString()
    tokens['--semi-color-success-hover'] = success.darken(6).toHexString()
    tokens['--semi-color-success-active'] = success.darken(12).toHexString()
    tokens['--semi-color-success-light-default'] = success.setAlpha(dark ? 0.18 : 0.1).toRgbString()
  }

  if (options.colorWarning) {
    const warning = new TinyColor(options.colorWarning)
    tokens['--semi-color-warning'] = warning.toHexString()
    tokens['--semi-color-warning-hover'] = warning.darken(6).toHexString()
    tokens['--semi-color-warning-active'] = warning.darken(12).toHexString()
    tokens['--semi-color-warning-light-default'] = warning.setAlpha(dark ? 0.18 : 0.1).toRgbString()
  }

  if (options.colorDestructive) {
    const danger = new TinyColor(options.colorDestructive)
    tokens['--semi-color-danger'] = danger.toHexString()
    tokens['--semi-color-danger-hover'] = danger.darken(6).toHexString()
    tokens['--semi-color-danger-active'] = danger.darken(12).toHexString()
    tokens['--semi-color-danger-light-default'] = danger.setAlpha(dark ? 0.18 : 0.1).toRgbString()
  }

  return tokens
}

// 函数：applyAdminTheme。把主题配置同步到根节点 class、data-theme 和 CSS 变量。
export function applyAdminTheme(options: AdminThemeOptions) {
  const root = document.documentElement
  const body = typeof document !== 'undefined' ? document.body : undefined
  const dark = isDarkTheme(options.mode)

  // 同步 class、data-theme 和 CSS 变量，确保 Tailwind、Semi 与自定义样式一致。
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
  root.dataset.theme = options.builtinType
  root.style.setProperty('--radius', `${options.radius}rem`)
  root.style.setProperty('--font-size-base', `${options.fontSize}px`)
  root.style.setProperty('--menu-font-size', `calc(${options.fontSize}px * 0.875)`)

  // 同步 Semi Design 的明暗主题模式
  if (body) {
    if (dark) {
      body.setAttribute('theme-mode', 'dark')
    } else {
      body.removeAttribute('theme-mode')
    }
  }

  const primary = resolvePrimaryColor(options, dark)
  const hexPrimary = new TinyColor(primary).toHexString()

  // 解析并同步 Semi Design 全套圆角与色彩 Token
  const semiRadiusTokens = resolveSemiRadiusTokens(options.radius)
  const semiColorTokens = resolveSemiColorTokens(options, hexPrimary, dark)
  const allSemiTokens = {
    ...semiRadiusTokens,
    ...semiColorTokens
  }

  // 同步应用到 document.documentElement 及 document.body（针对挂载在 body 上的 Portal / Modal / Tooltip）
  Object.entries(allSemiTokens).forEach(([name, value]) => {
    root.style.setProperty(name, value)
    if (body) {
      body.style.setProperty(name, value)
    }
  })

  const colorVariables = {
    '--destructive': toHslCssVar(options.colorDestructive ?? 'hsl(348 100% 61%)'),
    '--primary': toHslCssVar(primary),
    ...resolveSurfaceVariables(dark, options),
    '--success': toHslCssVar(options.colorSuccess ?? 'hsl(144 57% 58%)'),
    '--warning': toHslCssVar(options.colorWarning ?? 'hsl(42 84% 61%)')
  }

  Object.entries(colorVariables).forEach(([name, value]) => {
    root.style.setProperty(name, value)
  })
  updateCSSVariables(
    {
      ...colorVariables,
      ...allSemiTokens
    },
    '__admin-theme-styles__',
    ':root, body, body[theme-mode="dark"]'
  )
}

// 函数：resolveSurfaceVariables。根据暗色和半深色配置生成表面变量。
function resolveSurfaceVariables(dark: boolean, options: AdminThemeOptions) {
  // 半深色开关允许顶栏/侧栏独立使用深色表面，内容区保持浅色。
  const headerDark = dark || options.semiDarkHeader
  const sidebarDark = dark || options.semiDarkSidebar
  const sidebarSubDark = dark || options.semiDarkSidebarSub
  const sidebarVariables = sidebarDark ? darkSidebarVariables() : lightSidebarVariables()
  const sidebarSubVariables = sidebarSubDark
    ? darkSidebarSubVariables()
    : lightSidebarSubVariables()

  return {
    '--header': headerDark ? '240 10% 3.9%' : '0 0% 100%',
    '--header-foreground': headerDark ? '0 0% 98%' : '240 10% 3.9%',
    '--menu': sidebarVariables['--sidebar'],
    ...sidebarVariables,
    ...sidebarSubVariables
  }
}

// 函数：darkSidebarVariables。返回暗色侧边栏的 CSS 变量。
function darkSidebarVariables() {
  return {
    '--sidebar': '240 10% 3.9%',
    '--sidebar-accent': '240 4% 13%',
    '--sidebar-accent-foreground': '0 0% 98%',
    '--sidebar-active': '240 4% 15%',
    '--sidebar-active-foreground': '0 0% 100%',
    '--sidebar-active-indicator': 'var(--primary)',
    '--sidebar-border': '240 4% 16%',
    '--sidebar-foreground': '240 5% 78%',
    '--sidebar-hover': '240 4% 13%',
    '--sidebar-hover-foreground': '0 0% 100%'
  }
}

// 函数：lightSidebarVariables。返回亮色侧边栏的 CSS 变量。
function lightSidebarVariables() {
  return {
    '--sidebar': '0 0% 100%',
    '--sidebar-accent': '240 5% 96%',
    '--sidebar-accent-foreground': '240 10% 3.9%',
    '--sidebar-active': 'var(--primary) / 10%',
    '--sidebar-active-foreground': 'var(--primary)',
    '--sidebar-active-indicator': 'var(--primary)',
    '--sidebar-border': '240 6% 90%',
    '--sidebar-foreground': '240 10% 20%',
    '--sidebar-hover': '240 5% 96%',
    '--sidebar-hover-foreground': '240 10% 3.9%'
  }
}

// 函数：darkSidebarSubVariables。返回暗色二级侧边栏的 CSS 变量。
function darkSidebarSubVariables() {
  return {
    '--sidebar-sub': '240 10% 3.9%',
    '--sidebar-deep': '240 10% 2.8%'
  }
}

// 函数：lightSidebarSubVariables。返回亮色二级侧边栏的 CSS 变量。
function lightSidebarSubVariables() {
  return {
    '--sidebar-sub': '0 0% 100%',
    '--sidebar-deep': '240 5% 98%'
  }
}

// 函数：resolvePrimaryColor。根据内置主题和明暗模式选择主色。
function resolvePrimaryColor(
  options: Pick<AdminThemeOptions, 'builtinType' | 'colorPrimary'>,
  dark: boolean
) {
  if (options.builtinType === 'custom') {
    return options.colorPrimary ?? 'hsl(240 60% 60%)'
  }

  const preset = BUILT_IN_THEME_PRESETS.find(item => item.type === options.builtinType)

  if (!preset) {
    return options.colorPrimary ?? 'hsl(240 60% 60%)'
  }

  return (dark ? preset.darkPrimaryColor : preset.primaryColor) || preset.color
}

// 函数：resolveAdminPrimaryColor。按偏好设置和明暗模式解析当前主色。
export function resolveAdminPrimaryColor(
  options: Pick<AdminThemeOptions, 'builtinType' | 'colorPrimary'>,
  dark: boolean
) {
  return resolvePrimaryColor(options, dark)
}

// 函数：toHslCssVar。把颜色值转换成 CSS 变量使用的 HSL 通道。
function toHslCssVar(color: string) {
  const hslMatch = color.match(/^hsl\((.*)\)$/)

  if (hslMatch?.[1]) {
    return hslMatch[1].trim()
  }

  // 主题变量只存储 HSL 通道，存在透明度时再追加 alpha。
  const { a, h, l, s } = new TinyColor(color).toHsl()
  const hsl = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`

  return a < 1 ? `${hsl} / ${a}` : hsl
}

// 函数：updateCSSVariables。生成样式标签，暴露可被读取的 CSS 变量规则。
function updateCSSVariables(
  variables: Record<string, string>,
  id = '__admin-theme-styles__',
  selector = ':root'
) {
  // 样式标签同步内联变量，供读取样式规则的消费方使用。
  const styleElement =
    document.querySelector<HTMLStyleElement>(`#${id}`) ?? document.createElement('style')

  styleElement.id = id
  styleElement.textContent = `${selector} {${Object.entries(variables)
    .map(([key, value]) => `${key}: ${value};`)
    .join('')}}`

  if (!styleElement.parentElement) {
    document.head.append(styleElement)
  }
}
