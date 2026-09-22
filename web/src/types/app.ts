import type { ReactNode } from 'react'

// 类型：LayoutMode。定义后台外壳可用的整体布局模式。
export type LayoutMode =
  | 'full-content'
  | 'header-mixed-nav'
  | 'header-nav'
  | 'header-sidebar-nav'
  | 'mixed-nav'
  | 'sidebar-mixed-nav'
  | 'sidebar-nav'

// 类型：ColorMode。定义主题明暗模式。
export type ColorMode = 'dark' | 'light' | 'system'
// 类型：ContentCompact。定义内容区宽度策略。
export type ContentCompact = 'compact' | 'wide'
// 类型：HeaderMenuAlign。定义顶栏菜单对齐方式。
export type HeaderMenuAlign = 'center' | 'end' | 'start'
// 类型：HeaderMode。定义顶栏固定和滚动隐藏策略。
export type HeaderMode = 'auto' | 'auto-scroll' | 'fixed' | 'static'
// 类型：NavigationStyleType。定义导航菜单项的视觉风格。
export type NavigationStyleType = 'plain' | 'rounded'
// 类型：PreferencesButtonPosition。定义偏好设置入口展示位置。
export type PreferencesButtonPosition = 'auto' | 'fixed' | 'header' | 'user-dropdown'
// 类型：TransitionName。定义页面切换动效名称。
export type TransitionName = 'fade' | 'fade-down' | 'fade-slide' | 'fade-up'
// 类型：BuiltinThemeType。定义内置主题预设标识。
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

// 类型：AdminPreferences。集中描述管理端外观、导航、快捷键和组件开关偏好。
export interface AdminPreferences {
  // 参数：animationEnable。控制全局动画是否启用。
  animationEnable: boolean
  // 参数：appDynamicTitle。控制浏览器标题是否随路由变化。
  appDynamicTitle: boolean
  // 参数：appEnableCheckUpdates。控制是否显示检查更新能力。
  appEnableCheckUpdates: boolean
  // 参数：appEnableCopyPreferences。控制是否允许复制偏好配置。
  appEnableCopyPreferences: boolean
  // 参数：appEnableStickyPreferencesNavigationBar。控制偏好面板导航是否吸顶。
  appEnableStickyPreferencesNavigationBar: boolean
  // 参数：appLocale。当前应用语言标识。
  appLocale: string
  // 参数：appPreferencesButtonPosition。偏好设置按钮展示位置。
  appPreferencesButtonPosition: PreferencesButtonPosition
  // 参数：appTimezone。当前应用时区。
  appTimezone: string
  // 参数：appWatermark。控制水印是否启用。
  appWatermark: boolean
  // 参数：appWatermarkContent。水印显示文本。
  appWatermarkContent: string
  // 参数：colorGrayMode。控制页面是否进入灰度模式。
  colorGrayMode: boolean
  // 参数：colorWeakMode。控制页面是否进入色弱辅助模式。
  colorWeakMode: boolean
  // 参数：breadcrumbEnable。控制面包屑是否展示。
  breadcrumbEnable: boolean
  // 参数：breadcrumbHideOnlyOne。控制只有一个面包屑时是否隐藏。
  breadcrumbHideOnlyOne: boolean
  // 参数：breadcrumbShowHome。控制面包屑是否展示首页项。
  breadcrumbShowHome: boolean
  // 参数：breadcrumbShowIcon。控制面包屑是否展示图标。
  breadcrumbShowIcon: boolean
  // 参数：breadcrumbStyleType。面包屑视觉样式。
  breadcrumbStyleType: 'background' | 'normal'
  // 参数：colorMode。当前主题明暗模式。
  colorMode: ColorMode
  // 参数：contentCompact。内容区宽度策略。
  contentCompact: ContentCompact
  // 参数：contentCompactWidth。紧凑内容区最大宽度。
  contentCompactWidth: number
  // 参数：contentPadding。内容区内边距。
  contentPadding: number
  // 参数：copyrightCompanyName。版权公司名称。
  copyrightCompanyName: string
  // 参数：copyrightCompanySiteLink。版权公司链接。
  copyrightCompanySiteLink: string
  // 参数：copyrightDate。版权年份或日期文本。
  copyrightDate: string
  // 参数：copyrightEnable。控制版权信息是否展示。
  copyrightEnable: boolean
  // 参数：copyrightIcp。ICP备案文本。
  copyrightIcp: string
  // 参数：copyrightIcpLink。ICP备案跳转链接。
  copyrightIcpLink: string
  // 参数：footerEnable。控制页脚是否展示。
  footerEnable: boolean
  // 参数：footerFixed。控制页脚是否固定在底部。
  footerFixed: boolean
  // 参数：headerHeight。顶栏高度。
  headerHeight: number
  // 参数：headerMenuAlign。顶栏菜单对齐方式。
  headerMenuAlign: HeaderMenuAlign
  // 参数：headerMode。顶栏固定和滚动策略。
  headerMode: HeaderMode
  // 参数：headerVisible。控制顶栏是否可见。
  headerVisible: boolean
  // 参数：layout。当前整体布局模式。
  layout: LayoutMode
  // 参数：navigationAccordion。控制侧边导航是否手风琴展开。
  navigationAccordion: boolean
  // 参数：navigationSplit。控制混合导航是否拆分根菜单和子菜单。
  navigationSplit: boolean
  // 参数：navigationStyleType。导航菜单项视觉风格。
  navigationStyleType: NavigationStyleType
  // 参数：shortcutKeysEnable。控制快捷键总开关。
  shortcutKeysEnable: boolean
  // 参数：shortcutKeysGlobalEscape。控制全局 Escape 快捷键是否启用。
  shortcutKeysGlobalEscape: boolean
  // 参数：shortcutKeysGlobalLockScreen。控制锁屏快捷键是否启用。
  shortcutKeysGlobalLockScreen: boolean
  // 参数：shortcutKeysGlobalLogout。控制退出登录快捷键是否启用。
  shortcutKeysGlobalLogout: boolean
  // 参数：shortcutKeysGlobalSearch。控制全局搜索快捷键是否启用。
  shortcutKeysGlobalSearch: boolean
  // 参数：sidebarAutoActivateChild。控制选择父菜单时是否自动进入子页面。
  sidebarAutoActivateChild: boolean
  // 参数：sidebarCollapsed。控制主侧边栏是否折叠。
  sidebarCollapsed: boolean
  // 参数：sidebarCollapsedButton。控制侧边栏折叠按钮是否展示。
  sidebarCollapsedButton: boolean
  // 参数：sidebarCollapsedShowTitle。控制折叠侧栏是否保留标题。
  sidebarCollapsedShowTitle: boolean
  // 参数：sidebarDraggable。控制侧边栏宽度是否可拖拽。
  sidebarDraggable: boolean
  // 参数：sidebarEnable。控制侧边栏功能总开关。
  sidebarEnable: boolean
  // 参数：sidebarExtraCollapsed。控制混合侧栏二级栏是否折叠。
  sidebarExtraCollapsed: boolean
  // 参数：sidebarExpandOnHover。控制折叠侧栏悬停展开。
  sidebarExpandOnHover: boolean
  // 参数：sidebarFixedButton。控制固定侧栏按钮是否展示。
  sidebarFixedButton: boolean
  // 参数：sidebarHidden。控制侧边栏是否隐藏。
  sidebarHidden: boolean
  // 参数：sidebarMixedWidth。混合导航根侧栏宽度。
  sidebarMixedWidth: number
  // 参数：sidebarWidth。主侧边栏或二级侧栏宽度。
  sidebarWidth: number
  // 参数：tabbarEnable。控制标签栏是否展示。
  tabbarEnable: boolean
  // 参数：tabbarDraggable。控制标签页是否可拖拽排序。
  tabbarDraggable: boolean
  // 参数：tabbarHeight。标签栏高度。
  tabbarHeight: number
  // 参数：tabbarMaxCount。标签栏最多展示数量。
  tabbarMaxCount: number
  // 参数：tabbarMiddleClickToClose。控制鼠标中键是否关闭标签。
  tabbarMiddleClickToClose: boolean
  // 参数：tabbarPersist。控制标签页是否持久化。
  tabbarPersist: boolean
  // 参数：tabbarShowIcon。控制标签页是否展示图标。
  tabbarShowIcon: boolean
  // 参数：tabbarShowMaximize。控制标签栏最大化按钮是否展示。
  tabbarShowMaximize: boolean
  // 参数：tabbarShowMore。控制标签栏更多菜单是否展示。
  tabbarShowMore: boolean
  // 参数：tabbarShowRefresh。控制标签栏刷新按钮是否展示。
  tabbarShowRefresh: boolean
  // 参数：tabbarStyleType。标签栏视觉样式。
  tabbarStyleType: 'brisk' | 'card' | 'chrome' | 'plain'
  // 参数：tabbarVisitHistory。控制是否记录标签访问历史。
  tabbarVisitHistory: boolean
  // 参数：tabbarWheelable。控制滚轮是否可横向滚动标签栏。
  tabbarWheelable: boolean
  // 参数：themeBuiltinType。当前内置主题预设。
  themeBuiltinType: BuiltinThemeType
  // 参数：themeColorDestructive。危险色。
  themeColorDestructive: string
  // 参数：themeColorPrimary。主色。
  themeColorPrimary: string
  // 参数：themeColorSuccess。成功色。
  themeColorSuccess: string
  // 参数：themeColorWarning。警告色。
  themeColorWarning: string
  // 参数：themeFontSize。基础字号。
  themeFontSize: number
  // 参数：themeRadius。圆角半径。
  themeRadius: string
  // 参数：themeSemiDarkHeader。控制顶栏是否使用半深色。
  themeSemiDarkHeader: boolean
  // 参数：themeSemiDarkSidebar。控制侧边栏是否使用半深色。
  themeSemiDarkSidebar: boolean
  // 参数：themeSemiDarkSidebarSub。控制二级侧边栏是否使用半深色。
  themeSemiDarkSidebarSub: boolean
  // 参数：transitionEnable。控制页面切换动效总开关。
  transitionEnable: boolean
  // 参数：transitionLoading。控制页面切换 loading 是否展示。
  transitionLoading: boolean
  // 参数：transitionName。页面切换动效名称。
  transitionName: TransitionName
  // 参数：transitionProgress。控制页面切换进度条是否展示。
  transitionProgress: boolean
  // 参数：widgetFullscreen。控制全屏工具按钮是否展示。
  widgetFullscreen: boolean
  // 参数：widgetGlobalSearch。控制全局搜索工具按钮是否展示。
  widgetGlobalSearch: boolean
  // 参数：widgetLanguageToggle。控制语言切换工具按钮是否展示。
  widgetLanguageToggle: boolean
  // 参数：widgetLockScreen。控制锁屏工具入口是否展示。
  widgetLockScreen: boolean
  // 参数：widgetNotification。控制通知工具按钮是否展示。
  widgetNotification: boolean
  // 参数：widgetRefresh。控制刷新工具按钮是否展示。
  widgetRefresh: boolean
  // 参数：widgetSidebarToggle。控制侧边栏切换工具按钮是否展示。
  widgetSidebarToggle: boolean
  // 参数：widgetThemeToggle。控制主题切换工具按钮是否展示。
  widgetThemeToggle: boolean
  // 参数：widgetTimezone。控制时区工具按钮是否展示。
  widgetTimezone: boolean
}

// 类型：MenuRecord。描述菜单节点及其层级关系。
export interface MenuRecord {
  // 参数：badge。菜单右侧徽标文本。
  badge?: string
  // 参数：children。子菜单节点。
  children?: MenuRecord[]
  // 参数：disabled。菜单是否禁用。
  disabled?: boolean
  // 参数：icon。菜单图标名称。
  icon?: string
  // 参数：key。菜单唯一标识。
  key: string
  // 参数：path。菜单对应路由路径。
  path: string
  // 参数：permission。访问该菜单需要的权限标识。
  permission?: string | string[]
  // 参数：title。菜单展示标题。
  title: string
}

// 类型：TabRecord。描述标签页状态中的单个标签。
export interface TabRecord {
  // 参数：affix。标签是否固定不可关闭。
  affix?: boolean
  // 参数：badge。标签徽标文本。
  badge?: string
  // 参数：icon。标签图标名称或路径标识。
  icon?: string
  // 参数：key。标签唯一标识。
  key: string
  // 参数：path。标签对应路由路径。
  path: string
  // 参数：title。标签展示标题。
  title: string
}

// 类型：FormComponentType。定义 schema 表单支持的组件类型。
export type FormComponentType =
  | 'checkbox'
  | 'date-range'
  | 'input'
  | 'password'
  | 'pin'
  | 'select'
  | 'switch'
  | (string & {})

// 类型：FormValueFormat。描述表单字段提交前的自定义格式化函数。
export type FormValueFormat = (
  value: unknown,
  setValue: (fieldName: string, value: unknown) => void,
  values: Record<string, unknown>
) => unknown

// 类型：FormSchema。描述单个 schema 表单字段配置。
export interface FormSchema {
  // 参数：component。字段渲染组件类型。
  component: FormComponentType
  // 参数：componentProps。传给字段组件的额外属性。
  componentProps?: Record<string, unknown>
  // 参数：defaultValue。字段默认值。
  defaultValue?: unknown
  // 参数：fieldName。字段名，支持路径式字段。
  fieldName: string
  // 参数：label。字段标签内容。
  label?: ReactNode
  // 参数：rules。字段校验规则。
  rules?: unknown
  // 参数：valueFormat。字段提交前的格式化函数。
  valueFormat?: FormValueFormat
}

// 类型：FieldMappingFormatter。定义时间映射字段的格式化方式。
export type FieldMappingFormatter =
  | ((value: unknown, fieldName: string) => unknown)
  | [string, string]
  | null
  | string

// 类型：FieldMappingTime。定义时间范围字段到起止字段的映射配置。
export type FieldMappingTime = [string, [string, string], FieldMappingFormatter?][]

// 类型：ArrayToStringFields。定义需要把数组转换为字符串的字段配置。
export type ArrayToStringFields = Array<[string[], string?] | string>
