import { TinyColor } from '@ctrl/tinycolor'
import { Check, MoonStar, PencilLine, Plus, Sun, SunMoon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@douyinfe/semi-ui-19'
import {
  getAdminMessages,
  getColorModeOptions,
  getContentOptions,
  getLayoutOptions,
  getPreferenceStepAria,
  getThemePresetLabel
} from '@/i18n/admin-i18n'
import { cn } from '@/lib/utils'
import { preferenceRadiusOptions, preferenceTransitionOptions } from '@/layouts/preferences-options'
import { BUILT_IN_THEME_PRESETS } from '@/theme'
import type { AdminPreferences } from '@/types'

const colorModeIcons: Record<AdminPreferences['colorMode'], LucideIcon> = {
  dark: MoonStar,
  light: Sun,
  system: SunMoon
}

type ThemeModePickerProps = {
  locale: string
  mode: AdminPreferences['colorMode']
  setMode: (mode: AdminPreferences['colorMode']) => void
}

type LayoutModePickerProps = {
  locale: string
  layout: AdminPreferences['layout']
  setLayout: (layout: AdminPreferences['layout']) => void
}

type ContentModePickerProps = {
  locale: string
  mode: AdminPreferences['contentCompact']
  setMode: (mode: AdminPreferences['contentCompact']) => void
}

type BuiltinThemeGridProps = {
  activeType: AdminPreferences['themeBuiltinType']
  colorPrimary: string
  locale: string
  onCustomColorChange: (color: string) => void
  onSelect: (type: AdminPreferences['themeBuiltinType']) => void
}

type RadiusPickerProps = {
  radius: string
  setRadius: (radius: string) => void
}

type FontSizeStepperProps = {
  fontSize: number
  locale: string
  setFontSize: (fontSize: number) => void
}

type PreferenceChoiceProps = {
  active: boolean
  ariaLabel?: string
  children: ReactNode
  label: string
  onClick: () => void
  title?: string
}

type LayoutPreviewProps = {
  layout: AdminPreferences['layout']
}

type ContentPreviewProps = {
  mode: AdminPreferences['contentCompact']
}

type TransitionPresetPickerProps = {
  activeName: AdminPreferences['transitionName']
  locale: string
  onSelect: (value: AdminPreferences['transitionName']) => void
}

/**
 * 切换亮色、暗色和系统主题模式。
 *
 * @param props - 组件属性。
 * @param props.locale - 当前语言环境。
 * @param props.mode - 当前颜色模式。
 * @param props.setMode - 颜色模式变更回调。
 * @returns 主题模式选择器。
 */
export function ThemeModePicker({ locale, mode, setMode }: ThemeModePickerProps) {
  const colorModeOptions = getColorModeOptions(locale)

  return (
    <div className="flex w-full flex-wrap justify-between gap-y-4">
      {colorModeOptions.map(option => {
        const Icon = colorModeIcons[option.value]
        const active = mode === option.value

        return (
          <PreferenceChoice
            active={active}
            key={option.value}
            label={option.label}
            onClick={() => setMode(option.value)}
          >
            <Icon className="size-5" />
          </PreferenceChoice>
        )
      })}
    </div>
  )
}

/**
 * 切换后台整体布局模式。
 *
 * @param props - 组件属性。
 * @param props.locale - 当前语言环境。
 * @param props.layout - 当前布局模式。
 * @param props.setLayout - 布局模式变更回调。
 * @returns 带结构预览的布局模式选择器。
 */
export function LayoutModePicker({ locale, layout, setLayout }: LayoutModePickerProps) {
  const layoutOptions = getLayoutOptions(locale)
  const messages = getAdminMessages(locale)

  return (
    <div className="flex w-full flex-wrap gap-5">
      {layoutOptions.map(option => (
        <PreferenceChoice
          active={layout === option.value}
          ariaLabel={`${messages.preferences.layout.layout} ${option.label}`}
          key={option.value}
          label={option.label}
          onClick={() => setLayout(option.value)}
          title={option.tip}
        >
          <LayoutPreview layout={option.value} />
        </PreferenceChoice>
      ))}
    </div>
  )
}

/**
 * 切换内容区域宽度模式。
 *
 * @param props - 组件属性。
 * @param props.locale - 当前语言环境。
 * @param props.mode - 当前内容宽度模式。
 * @param props.setMode - 内容宽度模式变更回调。
 * @returns 带结构预览的内容宽度选择器。
 */
export function ContentModePicker({ locale, mode, setMode }: ContentModePickerProps) {
  const contentOptions = getContentOptions(locale)
  const messages = getAdminMessages(locale)

  return (
    <div className="flex w-full gap-5">
      {contentOptions.map(option => (
        <PreferenceChoice
          active={mode === option.value}
          ariaLabel={`${messages.preferences.layout.content} ${option.label}`}
          key={option.value}
          label={option.label}
          onClick={() => setMode(option.value)}
        >
          <ContentPreview mode={option.value} />
        </PreferenceChoice>
      ))}
    </div>
  )
}

/**
 * 渲染内置主题预设的选择网格。
 *
 * @param props - 组件属性。
 * @param props.activeType - 当前选中的主题预设。
 * @param props.colorPrimary - 自定义主题色。
 * @param props.locale - 当前语言环境。
 * @param props.onCustomColorChange - 自定义主题色变更回调。
 * @param props.onSelect - 主题预设选择回调。
 * @returns 内置主题和自定义主题色选择网格。
 */
export function BuiltinThemeGrid({
  activeType,
  colorPrimary,
  locale,
  onCustomColorChange,
  onSelect
}: BuiltinThemeGridProps) {
  const messages = getAdminMessages(locale)

  return (
    <div className="flex w-full flex-wrap justify-between gap-y-3">
      {BUILT_IN_THEME_PRESETS.map(preset => {
        const active = activeType === preset.type
        const label = getThemePresetLabel(preset.type, locale)

        return (
          <PreferenceChoice
            active={active}
            ariaLabel={`${messages.preferences.appearance.theme} ${label}`}
            key={preset.type}
            label={label}
            onClick={() => onSelect(preset.type)}
          >
            {preset.type === 'custom' ? (
              <span className="relative flex size-5 items-center justify-center rounded-sm">
                <PencilLine className="absolute z-10 size-5 opacity-60 group-hover:opacity-100" />
                <input
                  aria-label={messages.preferences.actions.customThemeColor}
                  className="absolute inset-0 opacity-0"
                  onChange={event => onCustomColorChange(event.target.value)}
                  onClick={event => event.stopPropagation()}
                  type="color"
                  value={toColorInputValue(colorPrimary)}
                />
              </span>
            ) : (
              <span className="size-5 rounded-md" style={{ backgroundColor: preset.color }} />
            )}
          </PreferenceChoice>
        )
      })}
    </div>
  )
}

/**
 * 调节全局圆角半径。
 *
 * @param props - 组件属性。
 * @param props.radius - 当前圆角半径。
 * @param props.setRadius - 圆角半径变更回调。
 * @returns 圆角预设按钮组。
 */
const radiusOptionStyles: Record<string, string> = {
  '0': 'rounded-none',
  '0.25': 'rounded-[3px]',
  '0.5': 'rounded-[6px]',
  '0.75': 'rounded-[10px]',
  '1': 'rounded-[14px]'
}

export function RadiusPicker({ radius, setRadius }: RadiusPickerProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {preferenceRadiusOptions.map(option => {
        const active = radius === option

        return (
          <button
            aria-label={`圆角 ${option}`}
            aria-pressed={active}
            data-active={active ? 'true' : undefined}
            className={cn(
              'h-8 border bg-background text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground cursor-pointer',
              radiusOptionStyles[option] ?? 'rounded-sm',
              active &&
                'border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90 hover:text-primary-foreground'
            )}
            key={option}
            onClick={() => setRadius(option)}
            type="button"
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 通过步进按钮调节基础字号。
 *
 * @param props - 组件属性。
 * @param props.fontSize - 当前基础字号。
 * @param props.locale - 当前语言环境。
 * @param props.setFontSize - 基础字号变更回调。
 * @returns 字号步进控件。
 */
export function FontSizeStepper({ fontSize, locale, setFontSize }: FontSizeStepperProps) {
  const messages = getAdminMessages(locale)

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[2.5rem_1fr_2.5rem_auto] items-center overflow-hidden rounded-md border">
        <Button
          aria-label={getPreferenceStepAria(
            locale,
            'decrease',
            messages.preferences.appearance.fontSize
          )}
          className="rounded-none !size-full !p-0"
          onClick={() => setFontSize(fontSize - 1)}
          theme="borderless"
          type="tertiary"
        >
          <span className="text-lg leading-none">-</span>
        </Button>
        <div className="border-x px-3 text-center text-sm font-medium tabular-nums">{fontSize}</div>
        <Button
          aria-label={getPreferenceStepAria(
            locale,
            'increase',
            messages.preferences.appearance.fontSize
          )}
          className="rounded-none !size-full !p-0"
          onClick={() => setFontSize(fontSize + 1)}
          theme="borderless"
          type="tertiary"
          icon={<Plus className="size-4" />}
        />
        <span className="px-2 text-xs text-muted-foreground">px</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {messages.preferences.appearance.fontSizeDescription}
      </div>
    </div>
  )
}

/**
 * 选择页面切换动效预设。
 *
 * @param props - 组件属性。
 * @param props.activeName - 当前选中的页面动效名称。
 * @param props.locale - 当前语言环境。
 * @param props.onSelect - 页面动效选择回调。
 * @returns 页面切换动效预设选择器。
 */
export function TransitionPresetPicker({
  activeName,
  locale,
  onSelect
}: TransitionPresetPickerProps) {
  const messages = getAdminMessages(locale)

  return (
    <div className="grid grid-cols-4 gap-3 px-2 py-2">
      {preferenceTransitionOptions.map(item => {
        const active = activeName === item.value

        return (
          <button
            aria-label={`${messages.preferences.animation.title} ${item.label}`}
            aria-pressed={active}
            data-active={active ? 'true' : undefined}
            className={cn(
              'admin-outline-box relative flex h-14 min-w-0 items-center justify-center overflow-hidden rounded-md bg-background p-2',
              active && 'admin-outline-box-active'
            )}
            key={item.value}
            onClick={() => onSelect(item.value)}
            type="button"
          >
            <span
              className={cn('h-9 w-10 rounded-md bg-primary', `transition-preview-${item.value}`)}
            />
            {active ? (
              <Check className="admin-outline-check pointer-events-none" strokeWidth={3} />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 把任意主题色转换为颜色输入框可识别的 HEX。
 *
 * @param color - 待转换的主题色，支持 HEX、HSL 等 TinyColor 可解析格式。
 * @returns 可写入 `input[type="color"]` 的 HEX 色值。
 */
function toColorInputValue(color: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color
  }

  const parsed = new TinyColor(color)

  if (parsed.isValid) {
    return parsed.toHexString()
  }

  return '#0072e5'
}

/**
 * 渲染偏好设置中的图文选择项。
 *
 * @param props - 组件属性。
 * @param props.active - 当前选项是否选中。
 * @param props.ariaLabel - 可选无障碍标签。
 * @param props.children - 选择项中的预览内容。
 * @param props.label - 选择项展示文本。
 * @param props.onClick - 点击选择回调。
 * @param props.title - 可选浏览器提示文本。
 * @returns 带选中态的图文按钮。
 */
function PreferenceChoice({
  active,
  ariaLabel,
  children,
  label,
  onClick,
  title
}: PreferenceChoiceProps) {
  return (
    <button
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      data-active={active ? 'true' : undefined}
      className="group flex w-25 min-w-0 cursor-pointer flex-col items-center gap-2 text-center text-xs text-muted-foreground"
      onClick={onClick}
      title={title}
      type="button"
    >
      <span
        className={cn(
          'admin-outline-box relative flex h-14 w-full items-center justify-center overflow-hidden rounded-md bg-background text-foreground transition-all',
          active && 'admin-outline-box-active'
        )}
        data-active={active ? 'true' : undefined}
      >
        {children}
        {active ? (
          <Check className="admin-outline-check pointer-events-none" strokeWidth={3} />
        ) : null}
      </span>
      <span
        className={cn(
          'admin-outline-label w-full truncate',
          active && 'font-semibold text-primary'
        )}
      >
        {label}
      </span>
    </button>
  )
}

/**
 * 预览后台布局模式的结构效果。
 *
 * @param props - 组件属性。
 * @param props.layout - 待预览的布局模式。
 * @returns 布局模式 SVG 预览。
 */
function LayoutPreview({ layout }: LayoutPreviewProps) {
  const hasHeader = layout !== 'full-content' && layout !== 'sidebar-nav'
  const headerPrimary = ['header-nav', 'header-mixed-nav', 'mixed-nav'].includes(layout)
  const hasPrimarySidebar = [
    'header-mixed-nav',
    'header-sidebar-nav',
    'sidebar-mixed-nav',
    'sidebar-nav'
  ].includes(layout)
  const hasSecondarySidebar = ['header-mixed-nav', 'mixed-nav', 'sidebar-mixed-nav'].includes(
    layout
  )
  const headerY = hasHeader ? 9 : 0
  const contentX =
    layout === 'sidebar-nav'
      ? 29
      : layout === 'sidebar-mixed-nav' || layout === 'header-mixed-nav'
        ? 26
        : layout === 'header-sidebar-nav' || layout === 'mixed-nav'
          ? 19
          : 4

  if (layout === 'full-content') {
    return (
      <svg
        className="admin-layout-preview"
        fill="none"
        height="66"
        viewBox="0 0 104 66"
        width="104"
      >
        <rect fill="currentColor" fillOpacity="0.02" height="66" rx="4" width="104" />
        <rect fill="currentColor" fillOpacity="0.08" height="26" rx="2" width="39" x="4" y="4" />
        <rect fill="currentColor" fillOpacity="0.08" height="26" rx="2" width="50" x="49" y="4" />
        <rect fill="currentColor" fillOpacity="0.08" height="25" rx="2" width="95" x="4" y="35" />
      </svg>
    )
  }

  return (
    <svg className="admin-layout-preview" fill="none" height="66" viewBox="0 0 104 66" width="104">
      <rect fill="currentColor" fillOpacity="0.02" height="66" rx="4" width="104" />
      {hasHeader ? (
        <>
          <rect
            fill={headerPrimary ? 'hsl(var(--primary))' : 'currentColor'}
            fillOpacity={headerPrimary ? 1 : 0.08}
            height="9"
            width="104"
          />
          <rect
            fill={headerPrimary ? '#e5e5e5' : '#b2b2b2'}
            height="2.8"
            rx="1.4"
            width="7.5"
            x="28"
            y="3"
          />
          <rect
            fill={headerPrimary ? '#e5e5e5' : '#b2b2b2'}
            height="2.8"
            rx="1.4"
            width="7.5"
            x="41"
            y="3.2"
          />
          <rect
            fill={headerPrimary ? '#e5e5e5' : '#b2b2b2'}
            height="2.8"
            rx="1.4"
            width="7.5"
            x="54"
            y="3"
          />
          <rect fill="#ffffff" height="6.5" rx="2" width="7.8" x="1.5" y="1" />
        </>
      ) : null}
      {hasPrimarySidebar ? (
        <rect
          fill="hsl(var(--primary))"
          height={layout === 'sidebar-nav' || layout === 'sidebar-mixed-nav' ? 66 : 57}
          width={
            layout === 'sidebar-nav'
              ? 27
              : layout === 'sidebar-mixed-nav' || layout === 'header-mixed-nav'
                ? 10
                : 15
          }
          x="0"
          y={layout === 'sidebar-nav' || layout === 'sidebar-mixed-nav' ? 0 : headerY}
        />
      ) : null}
      {hasSecondarySidebar ? (
        <rect
          fill="currentColor"
          fillOpacity="0.08"
          height={layout === 'sidebar-mixed-nav' ? 66 : 57}
          width={layout === 'mixed-nav' ? 15 : 12}
          x={layout === 'mixed-nav' ? 0 : 10}
          y={layout === 'sidebar-mixed-nav' ? 0 : headerY}
        />
      ) : null}
      {['sidebar-nav', 'sidebar-mixed-nav'].includes(layout) ? (
        <rect
          fill="#ffffff"
          height="7.5"
          rx="2"
          width="8.2"
          x={layout === 'sidebar-nav' ? 9 : 0.6}
          y="1.4"
        />
      ) : null}
      {hasPrimarySidebar ? (
        <>
          <rect
            fill="#ffffff"
            fillOpacity={layout === 'sidebar-nav' || layout === 'header-sidebar-nav' ? 1 : 0.85}
            height="2.8"
            rx="1.4"
            width={layout === 'sidebar-nav' ? 17.5 : 5.5}
            x={layout === 'sidebar-nav' ? 4.9 : 1.7}
            y={headerY + 15}
          />
          <rect
            fill="#ffffff"
            fillOpacity={layout === 'sidebar-nav' || layout === 'header-sidebar-nav' ? 1 : 0.65}
            height="2.8"
            rx="1.4"
            width={layout === 'sidebar-nav' ? 17.5 : 5.5}
            x={layout === 'sidebar-nav' ? 4.9 : 1.7}
            y={headerY + 28}
          />
          <rect
            fill="#ffffff"
            fillOpacity={layout === 'sidebar-nav' || layout === 'header-sidebar-nav' ? 1 : 0.65}
            height="2.8"
            rx="1.4"
            width={layout === 'sidebar-nav' ? 17.5 : 5.5}
            x={layout === 'sidebar-nav' ? 4.9 : 1.7}
            y={headerY + 41}
          />
        </>
      ) : null}
      <rect
        fill="currentColor"
        fillOpacity="0.08"
        height="21.5"
        rx="2"
        width={98 - contentX}
        x={contentX}
        y={headerY + 14}
      />
      <rect
        fill="currentColor"
        fillOpacity="0.08"
        height="21"
        rx="2"
        width="24"
        x={contentX}
        y={headerY + 14}
      />
      <rect
        fill="currentColor"
        fillOpacity="0.08"
        height="21.5"
        rx="2"
        width={98 - contentX}
        x={contentX}
        y={headerY + 39}
      />
    </svg>
  )
}

/**
 * 预览内容宽度模式的布局效果。
 *
 * @param props - 组件属性。
 * @param props.mode - 待预览的内容宽度模式。
 * @returns 内容宽度 SVG 预览。
 */
function ContentPreview({ mode }: ContentPreviewProps) {
  return (
    <svg className="admin-layout-preview" fill="none" height="66" viewBox="0 0 104 66" width="104">
      <rect fill="currentColor" fillOpacity="0.02" height="66" rx="4" width="104" />
      <rect fill="hsl(var(--primary))" height="9" width="104" />
      <rect fill="#e5e5e5" height="2.8" rx="1.4" width="7.5" x="28" y="3" />
      <rect fill="#e5e5e5" height="2.8" rx="1.4" width="7.5" x="41" y="3.2" />
      <rect fill="#ffffff" height="6.5" rx="2" width="7.8" x="1.5" y="1" />
      <rect
        fill="currentColor"
        fillOpacity="0.08"
        height="21.5"
        rx="2"
        width={mode === 'compact' ? 42 : 54}
        x={mode === 'compact' ? 45 : 42}
        y="14"
      />
      <rect
        fill="currentColor"
        fillOpacity="0.08"
        height="21"
        rx="2"
        width={mode === 'compact' ? 24 : 34}
        x={mode === 'compact' ? 17 : 4}
        y="14"
      />
      <rect
        fill="currentColor"
        fillOpacity="0.08"
        height="21.5"
        rx="2"
        width={mode === 'compact' ? 72 : 95}
        x={mode === 'compact' ? 17 : 4}
        y="39"
      />
    </svg>
  )
}
