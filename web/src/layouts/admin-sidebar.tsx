import {
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pin,
  PinOff,
  SquareMenu,
  type LucideIcon
} from 'lucide-react'
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

import { AppLogo } from '@/components/app-logo'
import { Button, Tooltip } from '@douyinfe/semi-ui-19'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar
} from '@/layouts/sidebar-context'
import { getAdminMessages } from '@/i18n/admin-i18n'
import { cn } from '@/lib/utils'
import { getMenuRecordIcon, isMenuRecordActive } from '@/layouts/navigation'
import { getDefaultMenuPath } from '@/router/app-data'
import { preferenceStore } from '@/store/preferences'
import { usePreferencesSlice, useSetPreferences } from '@/store/use-preferences'
import type { MenuRecord } from '@/types'

// 函数：clampNumber。把数值约束在最小值和最大值之间。
function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

// 函数：uniqueHtmlElements。过滤空值并去重 DOM 元素。
function uniqueHtmlElements(elements: Array<Element | null | undefined>) {
  return Array.from(
    new Set(elements.filter((element): element is HTMLElement => element instanceof HTMLElement))
  )
}

// 函数：startDeferredSidebarResize。处理侧边栏拖拽预览，并在释放时提交宽度。
function startDeferredSidebarResize({
  event,
  max = 320,
  min = 160,
  onCommit,
  startWidth,
  targets
}: {
  event: ReactPointerEvent<HTMLDivElement>
  max?: number
  min?: number
  onCommit: (width: number) => void
  startWidth: number
  targets: HTMLElement[]
}) {
  // 拖拽过程中保持布局状态稳定，只在释放时提交最终宽度。
  event.preventDefault()
  event.stopPropagation()

  const dragHandle = event.currentTarget
  const startX = event.clientX
  const handleTransition = dragHandle.style.transition
  const handleTransform = dragHandle.style.transform
  const handleBackground = dragHandle.style.backgroundColor
  const targetTransitions = targets.map(target => [target, target.style.transition] as const)
  const overlay = document.createElement('div')
  let cleanupDone = false

  dragHandle.style.transition = 'none'
  targetTransitions.forEach(([target]) => {
    target.style.transition = 'none'
  })

  // 透明遮罩用于接管指针事件，避免拖出手柄后丢失拖拽状态。
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.zIndex = '9999'
  overlay.style.cursor = 'col-resize'
  overlay.style.userSelect = 'none'
  overlay.style.background = 'rgba(0, 0, 0, 0)'
  overlay.style.outline = 'none'
  overlay.tabIndex = -1
  document.body.append(overlay)

  // 函数：resolveWidth。根据指针位置计算约束后的宽度和越界状态。
  function resolveWidth(clientX: number) {
    const rawWidth = startWidth + clientX - startX
    return {
      outOfBounds: rawWidth < min || rawWidth > max,
      width: clampNumber(rawWidth, min, max)
    }
  }

  // 函数：restoreTargets。恢复参与拖拽的目标元素过渡样式。
  function restoreTargets() {
    targetTransitions.forEach(([target, transition]) => {
      target.style.transition = transition
    })
  }

  // 函数：cleanup。移除拖拽监听、遮罩和临时样式。
  function cleanup({ deferTargetRestore = false }: { deferTargetRestore?: boolean } = {}) {
    if (cleanupDone) {
      return
    }

    cleanupDone = true
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerCancel)
    dragHandle.style.transition = handleTransition
    dragHandle.style.transform = handleTransform
    dragHandle.style.backgroundColor = handleBackground
    overlay.remove()

    if (deferTargetRestore && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(restoreTargets)
    } else {
      restoreTargets()
    }
  }

  // 函数：handlePointerMove。拖拽时更新手柄位移和越界反馈。
  function handlePointerMove(pointerEvent: PointerEvent) {
    const { outOfBounds, width } = resolveWidth(pointerEvent.clientX)

    dragHandle.style.transform = `translateX(${width - startWidth}px)`
    dragHandle.style.backgroundColor = outOfBounds
      ? 'hsl(var(--primary) / 0.3)'
      : 'hsl(var(--primary))'
    overlay.style.cursor = outOfBounds ? 'not-allowed' : 'col-resize'
  }

  // 函数：handlePointerUp。释放指针时提交最终侧边栏宽度。
  function handlePointerUp(pointerEvent: PointerEvent) {
    const { width } = resolveWidth(pointerEvent.clientX)

    onCommit(Math.round(width))
    cleanup({ deferTargetRestore: true })
  }

  // 函数：handlePointerCancel。指针取消时回滚临时拖拽状态。
  function handlePointerCancel() {
    cleanup()
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerCancel)
}

/**
 * 渲染主侧边导航，并处理折叠、悬停展开和宽度拖拽。
 *
 * @param props - 组件属性。
 * @param props.activePath - 当前激活的路由路径。
 * @param props.ariaLabel - 侧边栏导航区域的可访问标签。
 * @param props.menu - 当前侧边栏菜单树。
 * @param props.navigate - 菜单跳转回调。
 * @param props.title - 侧边栏标题。
 * @param props.variant - 侧边栏展示类型。
 * @returns 主侧边导航。
 */
export function AdminSidebar({
  activePath,
  ariaLabel,
  menu,
  navigate,
  title,
  variant = 'primary'
}: {
  activePath: string
  ariaLabel?: string
  menu: MenuRecord[]
  navigate: (path: string) => void
  title?: string
  variant?: 'primary' | 'secondary'
}) {
  const preferences = usePreferencesSlice(preferences => ({
    appLocale: preferences.appLocale,
    layout: preferences.layout,
    navigationAccordion: preferences.navigationAccordion,
    navigationStyleType: preferences.navigationStyleType,
    sidebarAutoActivateChild: preferences.sidebarAutoActivateChild,
    sidebarCollapsed: preferences.sidebarCollapsed,
    sidebarCollapsedButton: preferences.sidebarCollapsedButton,
    sidebarDraggable: preferences.sidebarDraggable,
    sidebarExpandOnHover: preferences.sidebarExpandOnHover,
    widgetSidebarToggle: preferences.widgetSidebarToggle
  }))
  const setPreferences = useSetPreferences()
  const messages = getAdminMessages(preferences.appLocale)
  const sidebarAriaLabel = ariaLabel ?? messages.navigation.sidebar
  const sidebarTitle = title ?? messages.navigation.navigationMenu
  const [accordionOpenKey, setAccordionOpenKey] = useState<string | null>()
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const { isMobile, setOpenMobile } = useSidebar()
  const sidebarHeaderVisible = variant !== 'primary' || preferences.layout !== 'header-sidebar-nav'
  const sidebarTriggerVisible =
    variant === 'primary' &&
    preferences.widgetSidebarToggle &&
    preferences.sidebarCollapsedButton &&
    preferences.layout !== 'mixed-nav' &&
    preferences.layout !== 'sidebar-mixed-nav'

  // 函数：handleSidebarMouseEnter。悬停时临时展开已折叠的主侧边栏。
  function handleSidebarMouseEnter() {
    if (
      variant !== 'primary' ||
      preferences.sidebarExpandOnHover ||
      !preferences.sidebarCollapsed
    ) {
      return
    }

    setHoverExpanded(true)
    setPreferences({ sidebarCollapsed: false })
  }

  // 函数：handleSidebarMouseLeave。离开侧边栏时恢复悬停展开前的折叠状态。
  function handleSidebarMouseLeave() {
    if (!hoverExpanded) {
      return
    }

    setHoverExpanded(false)
    setPreferences({ sidebarCollapsed: true })
  }

  // 函数：startResize。启动主侧边栏宽度拖拽。
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!preferences.sidebarDraggable || variant !== 'primary') {
      return
    }

    const sidebar = event.currentTarget.closest("[data-slot='sidebar']")
    const targets = uniqueHtmlElements([
      sidebar?.querySelector("[data-slot='sidebar-gap']"),
      sidebar?.querySelector("[data-slot='sidebar-container']")
    ])

    startDeferredSidebarResize({
      event,
      onCommit: sidebarWidth => setPreferences({ sidebarWidth }),
      startWidth: preferenceStore.getState().preferences.sidebarWidth,
      targets
    })
  }

  // 函数：navigateFromSidebar。侧边栏导航后在移动端自动收起抽屉。
  function navigateFromSidebar(path: string) {
    navigate(path)

    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar
      className={cn(
        variant === 'primary' && 'admin-primary-sidebar',
        variant === 'secondary' &&
          'border-r bg-[hsl(var(--sidebar-sub))] [&_[data-slot=sidebar-inner]]:bg-[hsl(var(--sidebar-sub))]'
      )}
      collapsible={variant === 'secondary' ? 'none' : 'icon'}
      data-admin-layout={preferences.layout}
      data-admin-sidebar-variant={variant}
      data-hover-expanded={hoverExpanded ? 'true' : undefined}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
      variant="sidebar"
    >
      {sidebarHeaderVisible && (
        <SidebarHeader>
          {variant === 'primary' ? (
            <div
              className="flex h-10 items-center gap-2 rounded-lg px-2"
              data-slot="admin-sidebar-brand"
            >
              <AppLogo size="md" />
              <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">{messages.common.systemName}</span>
              </div>
            </div>
          ) : (
            <div className="grid h-10 min-w-0 place-content-center px-2 text-sm font-semibold text-sidebar-foreground">
              <span className="truncate">{sidebarTitle}</span>
            </div>
          )}
        </SidebarHeader>
      )}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{sidebarTitle}</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label={sidebarAriaLabel}>
              <SidebarMenu>
                {menu.map(item => (
                  <MenuNode
                    activePath={activePath}
                    accordion={preferences.navigationAccordion}
                    accordionOpenKey={accordionOpenKey}
                    autoActivateChild={preferences.sidebarAutoActivateChild}
                    item={item}
                    key={item.key}
                    navigate={navigateFromSidebar}
                    rounded={preferences.navigationStyleType === 'rounded'}
                    setAccordionOpenKey={setAccordionOpenKey}
                  />
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {sidebarTriggerVisible && (
        <SidebarFooter className="mt-auto">
          <SidebarTrigger
            aria-label={messages.navigation.toggleSidebar}
            className="size-8 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-hover-foreground group-data-[collapsible=icon]:mx-auto"
          />
        </SidebarFooter>
      )}
      {preferences.sidebarDraggable && variant === 'primary' && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 z-30 w-1 cursor-col-resize hover:bg-primary"
          onPointerDown={startResize}
        />
      )}
    </Sidebar>
  )
}

/**
 * 组织混合侧栏的根菜单和二级菜单区域。
 *
 * @param props - 组件属性。
 * @param props.activePath - 当前激活的路由路径。
 * @param props.activeRootPath - 当前激活的一级菜单路径。
 * @param props.navigate - 菜单跳转回调。
 * @param props.onSelectRoot - 根菜单选择回调。
 * @param props.rootAriaLabel - 根菜单导航区域的可访问标签。
 * @param props.rootMenus - 混合侧栏根菜单列表。
 * @param props.selectedRoot - 当前选中的根菜单。
 * @returns 混合侧栏框架。
 */
export function MixedSidebarFrame({
  activePath,
  activeRootPath,
  navigate,
  onSelectRoot,
  rootAriaLabel,
  rootMenus = [],
  selectedRoot
}: {
  activePath: string
  activeRootPath: string
  navigate: (path: string) => void
  onSelectRoot: (item: MenuRecord) => void
  rootAriaLabel?: string
  rootMenus?: MenuRecord[]
  selectedRoot: MenuRecord
}) {
  const preferences = usePreferencesSlice(preferences => ({
    appLocale: preferences.appLocale,
    navigationAccordion: preferences.navigationAccordion,
    navigationStyleType: preferences.navigationStyleType,
    sidebarAutoActivateChild: preferences.sidebarAutoActivateChild,
    sidebarDraggable: preferences.sidebarDraggable,
    sidebarExpandOnHover: preferences.sidebarExpandOnHover,
    sidebarExtraCollapsed: preferences.sidebarExtraCollapsed,
    sidebarMixedWidth: preferences.sidebarMixedWidth,
    sidebarWidth: preferences.sidebarWidth
  }))
  const setPreferences = useSetPreferences()
  const messages = getAdminMessages(preferences.appLocale)
  const [hoveredRoot, setHoveredRoot] = useState<MenuRecord | null>(null)
  const [accordionOpenKey, setAccordionOpenKey] = useState<string | null>()
  const [transientExtraVisible, setTransientExtraVisible] = useState(false)
  const fixedExtra = preferences.sidebarExpandOnHover
  const previewRoot = !fixedExtra && hoveredRoot?.children?.length ? hoveredRoot : selectedRoot
  const extraMenu = previewRoot.children ?? []
  const selectedExtraVisible = selectedRoot.children?.length
    ? fixedExtra || transientExtraVisible
    : false
  const extraVisible = !!hoveredRoot?.children?.length || selectedExtraVisible
  const extraCollapsed = preferences.sidebarExtraCollapsed
  const extraWidth = extraCollapsed ? 60 : preferences.sidebarWidth
  const frameWidth = preferences.sidebarMixedWidth + (extraVisible ? extraWidth : 0)
  const extraTitle = messages.common.systemName
  const resolvedRootAriaLabel = rootAriaLabel ?? messages.navigation.mixedMain

  // 函数：handleMouseLeave。离开混合侧栏时清理临时展开的二级栏。
  function handleMouseLeave() {
    if (!fixedExtra) {
      setHoveredRoot(null)
      setTransientExtraVisible(false)
    }
  }

  // 函数：startExtraResize。启动混合侧栏二级栏宽度拖拽。
  function startExtraResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!preferences.sidebarDraggable || extraCollapsed) {
      return
    }

    const sidebar = event.currentTarget.closest("[data-slot='mixed-sidebar']")
    const targets = uniqueHtmlElements([
      sidebar?.querySelector("[data-slot='mixed-sidebar-gap']"),
      sidebar?.querySelector("[data-slot='mixed-sidebar-container']"),
      event.currentTarget.parentElement
    ])

    startDeferredSidebarResize({
      event,
      onCommit: sidebarWidth => setPreferences({ sidebarWidth }),
      startWidth: preferences.sidebarWidth,
      targets
    })
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-slot="mixed-sidebar"
      style={
        {
          '--mixed-sidebar-width': `${preferences.sidebarMixedWidth}px`,
          '--mixed-sidebar-extra-width': `${extraWidth}px`,
          '--mixed-sidebar-frame-width': `${frameWidth}px`
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="relative w-(--mixed-sidebar-frame-width) bg-transparent transition-[width] duration-150 ease-linear"
        data-slot="mixed-sidebar-gap"
      />
      <aside
        className="fixed inset-y-0 left-0 z-20 flex h-svh w-(--mixed-sidebar-frame-width) bg-sidebar-deep transition-[width] duration-150 ease-linear"
        data-slot="mixed-sidebar-container"
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex h-full w-(--mixed-sidebar-width) shrink-0 flex-col border-r border-sidebar-border bg-sidebar-deep">
          <div className="flex h-12 items-center justify-center">
            <AppLogo size="md" />
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-2">
            <nav aria-label={resolvedRootAriaLabel}>
              <SidebarMenu className="gap-1">
                {rootMenus.map(item => (
                  <MixedRootMenuItem
                    activeRootPath={activeRootPath}
                    item={item}
                    key={item.key}
                    onMouseEnter={() => {
                      if (!fixedExtra) {
                        setHoveredRoot(item)
                      }
                    }}
                    onSelectRoot={rootItem => {
                      const hasChildren = !!rootItem.children?.length

                      if (!fixedExtra) {
                        setTransientExtraVisible(hasChildren)
                      } else {
                        setTransientExtraVisible(false)
                      }

                      onSelectRoot(rootItem)
                    }}
                    rounded={preferences.navigationStyleType === 'rounded'}
                  />
                ))}
              </SidebarMenu>
            </nav>
          </div>
        </div>
        <div
          className={cn(
            'relative flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-[hsl(var(--sidebar-sub))] transition-[width] duration-200',
            extraVisible && 'border-l'
          )}
          data-extra-visible={extraVisible ? 'true' : undefined}
          style={{ width: extraVisible ? extraWidth : 0 }}
        >
          <div
            className={cn(
              'flex h-[calc(var(--admin-header-height)-1px)] shrink-0 items-center border-b px-3',
              extraCollapsed && 'justify-center px-2'
            )}
            data-slot="mixed-sidebar-extra-title"
          >
            <div className="grid min-w-0 leading-tight">
              <span
                className={cn(
                  'truncate text-sm font-semibold text-sidebar-foreground',
                  extraCollapsed && 'sr-only'
                )}
              >
                {extraTitle}
              </span>
            </div>
          </div>
          {extraVisible && (
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-2 pb-12">
              <nav
                aria-label={messages.navigation.mixedSecondary}
                className={cn(extraCollapsed ? 'px-0' : 'px-2')}
              >
                <SidebarMenu className={cn(extraCollapsed && 'items-center gap-1')}>
                  {extraMenu.map(item =>
                    extraCollapsed ? (
                      <CollapsedExtraMenuItem
                        activePath={activePath}
                        item={item}
                        key={item.key}
                        navigate={navigate}
                        rounded={preferences.navigationStyleType === 'rounded'}
                      />
                    ) : (
                      <MenuNode
                        activePath={activePath}
                        accordion={preferences.navigationAccordion}
                        accordionOpenKey={accordionOpenKey}
                        autoActivateChild={preferences.sidebarAutoActivateChild}
                        item={item}
                        key={item.key}
                        navigate={navigate}
                        rounded={preferences.navigationStyleType === 'rounded'}
                        setAccordionOpenKey={setAccordionOpenKey}
                      />
                    )
                  )}
                </SidebarMenu>
              </nav>
            </div>
          )}
          <div aria-hidden="true" className="h-[42px] shrink-0" />
          {fixedExtra && extraVisible && (
            <Button
              aria-label={
                extraCollapsed
                  ? messages.navigation.expandSecondary
                  : messages.navigation.collapseSecondary
              }
              className="absolute bottom-2 left-3 z-10 size-6 rounded-sm bg-accent p-0 text-foreground/60 hover:bg-[hsl(var(--accent-hover))] hover:text-foreground"
              onClick={() => setPreferences({ sidebarExtraCollapsed: !extraCollapsed })}
              theme="borderless"
              type="tertiary"
            >
              {extraCollapsed ? (
                <ChevronsRight className="size-4" />
              ) : (
                <ChevronsLeft className="size-4" />
              )}
            </Button>
          )}
          {!extraCollapsed && extraVisible && (
            <Button
              aria-label={
                fixedExtra ? messages.navigation.hoverSecondary : messages.navigation.fixSecondary
              }
              className="absolute right-3 bottom-2 z-10 size-6 rounded-sm bg-accent p-0 text-foreground/60 hover:bg-[hsl(var(--accent-hover))] hover:text-foreground"
              onClick={() => {
                setTransientExtraVisible(fixedExtra)
                setPreferences({ sidebarExpandOnHover: !fixedExtra })
              }}
              theme="borderless"
              type="tertiary"
            >
              {fixedExtra ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
            </Button>
          )}
          {preferences.sidebarDraggable && extraVisible && !extraCollapsed && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 right-0 z-30 w-1 cursor-col-resize hover:bg-primary"
              onPointerDown={startExtraResize}
            />
          )}
        </div>
      </aside>
    </div>
  )
}

// 组件：MixedRootMenuItem。用于渲染混合导航的一级根菜单项。
function MixedRootMenuItem({
  activeRootPath,
  item,
  onMouseEnter,
  onSelectRoot,
  rounded
}: {
  activeRootPath: string
  item: MenuRecord
  onMouseEnter?: () => void
  onSelectRoot: (item: MenuRecord) => void
  rounded: boolean
}) {
  const Icon = getMenuRecordIcon(item)
  const isActive = activeRootPath === item.path

  return (
    <SidebarMenuItem className="px-2">
      <Tooltip content={item.title} position="right">
        <button
          aria-label={item.title}
          aria-pressed={isActive}
          className={cn(
            'group relative flex min-h-14 w-full flex-col items-center justify-center gap-1 px-0 py-2 text-sidebar-foreground/70 transition-[background-color,color,box-shadow] hover:bg-sidebar-hover/80 hover:text-sidebar-hover-foreground',
            rounded ? 'rounded-md' : 'rounded-none',
            isActive &&
              'rounded-none bg-sidebar-active/90 text-sidebar-active-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground'
          )}
          data-active={isActive ? 'true' : undefined}
          onMouseEnter={onMouseEnter}
          onClick={() => onSelectRoot(item)}
          type="button"
        >
          {Icon && <Icon className="size-5 transition-transform group-hover:scale-110" />}
          <span className="w-full truncate text-center text-[11px] leading-4">{item.title}</span>
        </button>
      </Tooltip>
    </SidebarMenuItem>
  )
}

// 组件：CollapsedExtraMenuItem。用于渲染混合侧栏折叠后的二级菜单入口。
function CollapsedExtraMenuItem({
  activePath,
  item,
  navigate,
  rounded
}: {
  activePath: string
  item: MenuRecord
  navigate: (path: string) => void
  rounded: boolean
}) {
  const Icon = getMenuRecordIcon(item, SquareMenu)
  const isActive = isMenuRecordActive(item, activePath)
  const targetPath = item.children?.length ? getDefaultMenuPath(item) : item.path

  return (
    <SidebarMenuItem className="flex w-full justify-center">
      <Tooltip content={item.title} position="right">
        <button
          aria-label={item.title}
          aria-pressed={isActive}
          className={cn(
            'flex h-10 w-12 items-center justify-center text-sidebar-foreground/70 transition-[background-color,color,box-shadow] hover:bg-sidebar-hover hover:text-sidebar-hover-foreground',
            rounded ? 'rounded-md' : 'rounded-none',
            isActive &&
              'bg-sidebar-active text-sidebar-active-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground'
          )}
          data-active={isActive ? 'true' : undefined}
          onClick={() => navigate(targetPath)}
          type="button"
        >
          <Icon className="size-5" />
        </button>
      </Tooltip>
    </SidebarMenuItem>
  )
}

// 组件：MenuNode。用于渲染侧边导航中的单个菜单节点。
function MenuNode({
  activePath,
  accordion,
  accordionOpenKey,
  autoActivateChild,
  item,
  navigate,
  rounded,
  setAccordionOpenKey
}: {
  activePath: string
  accordion: boolean
  accordionOpenKey?: string | null
  autoActivateChild: boolean
  item: MenuRecord
  navigate: (path: string) => void
  rounded: boolean
  setAccordionOpenKey?: (key: string | null) => void
}) {
  const Icon = getMenuRecordIcon(item)
  const children = item.children ?? []
  const isActive = activePath === item.path
  const hasActiveChild = children.some(child => isMenuRecordActive(child, activePath))
  const defaultOpen = hasActiveChild

  if (children.length > 0) {
    return (
      <CollapsibleMenuNode
        activePath={activePath}
        defaultOpen={defaultOpen}
        accordion={accordion}
        accordionOpenKey={accordionOpenKey}
        autoActivateChild={autoActivateChild}
        hasActiveChild={hasActiveChild}
        icon={Icon}
        item={item}
        navigate={navigate}
        rounded={rounded}
        setAccordionOpenKey={setAccordionOpenKey}
      />
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className={cn(!rounded && 'rounded-none')}
        isActive={isActive}
        tooltip={item.title}
      >
        <a
          href={item.path}
          onClick={event => {
            event.preventDefault()
            navigate(item.path)
          }}
        >
          {Icon && <Icon />}
          <span className="min-w-0 truncate">{item.title}</span>
        </a>
      </SidebarMenuButton>
      {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
    </SidebarMenuItem>
  )
}

// 组件：CollapsibleMenuNode。用于渲染可展开的侧边导航父节点。
function CollapsibleMenuNode({
  accordion,
  accordionOpenKey,
  activePath,
  autoActivateChild,
  defaultOpen,
  hasActiveChild,
  icon: Icon,
  item,
  navigate,
  rounded,
  setAccordionOpenKey
}: {
  accordion: boolean
  accordionOpenKey?: string | null
  activePath: string
  autoActivateChild: boolean
  defaultOpen: boolean
  hasActiveChild: boolean
  icon?: LucideIcon
  item: MenuRecord
  navigate: (path: string) => void
  rounded: boolean
  setAccordionOpenKey?: (key: string | null) => void
}) {
  const [explicitOpen, setExplicitOpen] = useState<boolean>()
  const accordionControlled = accordion && !!setAccordionOpenKey
  const open = accordionControlled
    ? accordionOpenKey === undefined
      ? defaultOpen
      : accordionOpenKey === item.key
    : (explicitOpen ?? defaultOpen)

  return (
    <SidebarMenuItem data-accordion={accordion ? 'true' : undefined}>
      <SidebarMenuButton
        aria-expanded={open}
        className={cn(!rounded && 'rounded-none')}
        isActive={hasActiveChild}
        isCurrent={false}
        onClick={() => {
          const nextOpen = !open

          if (accordionControlled) {
            setAccordionOpenKey(nextOpen ? item.key : null)
          } else {
            setExplicitOpen(nextOpen)
          }

          if (nextOpen && autoActivateChild) {
            navigate(getDefaultMenuPath(item))
          }
        }}
        tooltip={item.title}
      >
        {Icon && <Icon />}
        <span>{item.title}</span>
        <ChevronRight
          className={cn('ml-auto size-3.5 transition-transform', open && 'rotate-90')}
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {(item.children ?? []).map(child => (
            <SidebarMenuSubNode
              activePath={activePath}
              item={child}
              key={child.key}
              navigate={navigate}
            />
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}

// 组件：SidebarMenuSubNode。用于渲染侧边栏二级菜单节点。
function SidebarMenuSubNode({
  activePath,
  item,
  navigate
}: {
  activePath: string
  item: MenuRecord
  navigate: (path: string) => void
}) {
  const isActive = isMenuRecordActive(item, activePath)
  const isCurrent = item.path === activePath

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        asChild
        className="admin-sidebar-menu-sub-button"
        isActive={isActive}
        isCurrent={isCurrent}
      >
        <a
          href={item.path}
          onClick={event => {
            event.preventDefault()
            navigate(item.path)
          }}
        >
          <span>{item.title}</span>
          {item.badge && (
            <span aria-hidden="true" className="admin-sidebar-menu-count">
              {item.badge}
            </span>
          )}
        </a>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
}
