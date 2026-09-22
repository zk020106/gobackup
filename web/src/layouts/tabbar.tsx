import {
  ArrowLeftToLine,
  ArrowRightLeft,
  ArrowRightToLine,
  Copy,
  ExternalLink,
  FoldHorizontal,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  RefreshCcw,
  X
} from 'lucide-react'
import { useRef, type WheelEvent } from 'react'
import { Button, Dropdown } from '@douyinfe/semi-ui-19'

import { getAdminMessages } from '@/i18n/admin-i18n'
import { cn } from '@/lib/utils'
import { getTabIcon } from '@/layouts/navigation'
import { tabsStore } from '@/store/tabs'
import { usePreferencesSlice } from '@/store/use-preferences'
import type { TabRecord } from '@/types'

type TabbarProps = {
  activePath: string
  closeAllTabs: () => void
  closeLeftTabs: (key: string) => void
  closeOtherTabs: (key: string) => void
  closeRightTabs: (key: string) => void
  closeTab: (key: string) => void
  contentMaximized: boolean
  navigate: (path: string) => void
  onRefresh: () => void
  onToggleMaximize: () => void
  tabs: TabRecord[]
  toggleTabPin: (key: string) => void
}

/**
 * 渲染页面标签栏及其右键菜单操作。
 */
export function Tabbar({
  activePath,
  closeAllTabs,
  closeLeftTabs,
  closeOtherTabs,
  closeRightTabs,
  closeTab,
  contentMaximized,
  navigate,
  onRefresh,
  onToggleMaximize,
  tabs,
  toggleTabPin
}: TabbarProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const preferences = usePreferencesSlice(preferences => ({
    appLocale: preferences.appLocale,
    tabbarDraggable: preferences.tabbarDraggable,
    tabbarHeight: preferences.tabbarHeight,
    tabbarMaxCount: preferences.tabbarMaxCount,
    tabbarMiddleClickToClose: preferences.tabbarMiddleClickToClose,
    tabbarShowIcon: preferences.tabbarShowIcon,
    tabbarShowMaximize: preferences.tabbarShowMaximize,
    tabbarShowMore: preferences.tabbarShowMore,
    tabbarShowRefresh: preferences.tabbarShowRefresh,
    tabbarStyleType: preferences.tabbarStyleType,
    tabbarWheelable: preferences.tabbarWheelable
  }))
  const messages = getAdminMessages(preferences.appLocale)
  const visibleTabs = getVisibleTabs(tabs, activePath, preferences.tabbarMaxCount)
  const activeTab = tabs.find(tab => tab.key === activePath)

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!preferences.tabbarWheelable || !listRef.current) {
      return
    }

    event.preventDefault()
    listRef.current.scrollLeft += event.deltaY
  }

  function copyTabPath(tab: TabRecord) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return
    }

    void navigator.clipboard.writeText(tab.path)
  }

  function openTabInNewWindow(tab: TabRecord) {
    if (typeof window === 'undefined') {
      return
    }

    window.open(tab.path, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 border-b bg-muted/30 px-3 transition-[height] duration-200',
        preferences.tabbarStyleType === 'chrome' && 'admin-tabbar-chrome',
        preferences.tabbarStyleType === 'plain' && 'admin-tabbar-plain'
      )}
      data-slot="admin-tabbar"
      data-tabbar-style={preferences.tabbarStyleType}
      style={{ height: preferences.tabbarHeight }}
    >
      <div
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden"
        onWheel={handleWheel}
        ref={listRef}
      >
        <div role="tablist" className="admin-tabs-scroll flex items-center gap-1 min-w-0">
          {visibleTabs.map((tab, index) => {
            const Icon = getTabIcon(tab)
            const canClose = !tab.affix
            const hasClosableLeft = visibleTabs
              .slice(0, index)
              .some(item => !item.affix && item.key !== tab.key)
            const hasClosableRight = visibleTabs
              .slice(index + 1)
              .some(item => !item.affix && item.key !== tab.key)
            const hasClosableOther = visibleTabs.some(item => !item.affix && item.key !== tab.key)
            const isActive = activePath === tab.key

            return (
              <Dropdown
                key={tab.key}
                trigger="contextMenu"
                position="bottomLeft"
                render={
                  <Dropdown.Menu className="w-52">
                    <Dropdown.Item
                      disabled={!canClose}
                      icon={<X className="size-4" />}
                      onClick={() => closeTab(tab.key)}
                    >
                      {messages.tabbar.close}
                    </Dropdown.Item>
                    <Dropdown.Item
                      icon={tab.affix ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                      onClick={() => toggleTabPin(tab.key)}
                    >
                      {tab.affix ? messages.tabbar.unpin : messages.tabbar.pin}
                    </Dropdown.Item>
                    <Dropdown.Item
                      icon={
                        contentMaximized ? (
                          <Minimize2 className="size-4" />
                        ) : (
                          <Maximize2 className="size-4" />
                        )
                      }
                      onClick={onToggleMaximize}
                    >
                      {contentMaximized
                        ? messages.tabbar.restoreMaximize
                        : messages.tabbar.maximize}
                    </Dropdown.Item>
                    <Dropdown.Item icon={<RefreshCcw className="size-4" />} onClick={onRefresh}>
                      {messages.tabbar.refresh}
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      icon={<ExternalLink className="size-4" />}
                      onClick={() => openTabInNewWindow(tab)}
                    >
                      {messages.tabbar.openNewWindow}
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      disabled={!hasClosableLeft}
                      icon={<ArrowLeftToLine className="size-4" />}
                      onClick={() => closeLeftTabs(tab.key)}
                    >
                      {messages.tabbar.closeLeft}
                    </Dropdown.Item>
                    <Dropdown.Item
                      disabled={!hasClosableRight}
                      icon={<ArrowRightToLine className="size-4" />}
                      onClick={() => closeRightTabs(tab.key)}
                    >
                      {messages.tabbar.closeRight}
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      disabled={!hasClosableOther}
                      icon={<FoldHorizontal className="size-4" />}
                      onClick={() => closeOtherTabs(tab.key)}
                    >
                      {messages.tabbar.closeOther}
                    </Dropdown.Item>
                    <Dropdown.Item
                      disabled={!tabs.some(item => !item.affix)}
                      icon={<ArrowRightLeft className="size-4" />}
                      onClick={closeAllTabs}
                    >
                      {messages.tabbar.closeAll}
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      icon={<Copy className="size-4" />}
                      onClick={() => copyTabPath(tab)}
                    >
                      {messages.tabbar.copyPath}
                    </Dropdown.Item>
                  </Dropdown.Menu>
                }
              >
                <div
                  className={cn(
                    'group/tab relative flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-[background-color,color]',
                    isActive
                      ? 'bg-background text-foreground shadow-xs font-medium'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
                    preferences.tabbarStyleType === 'card' && 'border bg-background/60',
                    preferences.tabbarStyleType === 'brisk' &&
                      'rounded-none border-b-2 border-transparent',
                    preferences.tabbarStyleType === 'brisk' && isActive && 'border-primary'
                  )}
                  draggable={preferences.tabbarDraggable}
                  onDragOver={event => {
                    if (preferences.tabbarDraggable) {
                      event.preventDefault()
                    }
                  }}
                  onDragStart={event => {
                    if (preferences.tabbarDraggable) {
                      event.dataTransfer.setData('text/plain', tab.key)
                    }
                  }}
                  onDrop={event => {
                    if (!preferences.tabbarDraggable) {
                      return
                    }

                    event.preventDefault()
                    const fromKey = event.dataTransfer.getData('text/plain')
                    const currentTabs = tabsStore.getState().tabs
                    const fromIndex = currentTabs.findIndex(item => item.key === fromKey)
                    const toIndex = currentTabs.findIndex(item => item.key === tab.key)

                    tabsStore.getState().reorderTabs(fromIndex, toIndex)
                  }}
                >
                  <button
                    role="tab"
                    aria-selected={isActive}
                    data-state={isActive ? 'active' : 'inactive'}
                    className="flex items-center gap-1.5 cursor-pointer py-1 px-1 bg-transparent border-0 outline-hidden text-inherit"
                    onClick={() => navigate(tab.path)}
                    onMouseDown={event => {
                      if (
                        event.button === 1 &&
                        preferences.tabbarMiddleClickToClose &&
                        !tab.affix
                      ) {
                        event.preventDefault()
                        closeTab(tab.key)
                      }
                    }}
                  >
                    {preferences.tabbarShowIcon && Icon ? <Icon className="size-3.5" /> : null}
                    <span>{tab.title}</span>
                  </button>
                  {!tab.affix ? (
                    <Button
                      aria-label={messages.tabbar.closeCurrent.replace('{title}', tab.title)}
                      className="!size-4 !p-0 opacity-60 hover:opacity-100 !rounded-full"
                      onClick={e => {
                        e.stopPropagation()
                        closeTab(tab.key)
                      }}
                      theme="borderless"
                      type="tertiary"
                      icon={<X className="size-3" />}
                    />
                  ) : null}
                </div>
              </Dropdown>
            )
          })}
        </div>
      </div>
      {preferences.tabbarShowMore && activeTab ? (
        <Dropdown
          position="bottomRight"
          render={
            <Dropdown.Menu>
              <Dropdown.Item
                icon={<Copy className="size-4" />}
                onClick={() => copyTabPath(activeTab)}
              >
                {messages.tabbar.copyPath}
              </Dropdown.Item>
              <Dropdown.Item
                icon={<ExternalLink className="size-4" />}
                onClick={() => openTabInNewWindow(activeTab)}
              >
                {messages.tabbar.openNewWindow}
              </Dropdown.Item>
            </Dropdown.Menu>
          }
        >
          <Button
            aria-label={messages.tabbar.more}
            className="admin-tabbar-tool !p-0 size-7 !rounded-md"
            theme="borderless"
            type="tertiary"
            icon={<LayoutGrid className="size-3.5" />}
          />
        </Dropdown>
      ) : null}
      {preferences.tabbarShowRefresh ? (
        <Button
          aria-label={messages.tabbar.refreshCurrent}
          className="admin-tabbar-tool !p-0 size-7 !rounded-md"
          onClick={onRefresh}
          theme="borderless"
          type="tertiary"
          icon={<RefreshCcw className="size-3.5" />}
        />
      ) : null}
      {preferences.tabbarShowMaximize ? (
        <Button
          aria-label={
            contentMaximized ? messages.tabbar.restoreContent : messages.tabbar.maximizeContent
          }
          className="admin-tabbar-tool !p-0 size-7 !rounded-md"
          onClick={onToggleMaximize}
          theme="borderless"
          type="tertiary"
          icon={
            contentMaximized ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )
          }
        />
      ) : null}
    </div>
  )
}

/**
 * 按最大显示数量裁剪标签并保留当前激活标签。
 */
export function getVisibleTabs(tabs: TabRecord[], activePath: string, maxCount: number) {
  if (maxCount <= 0 || tabs.length <= maxCount) {
    return tabs
  }

  const latestTabs = tabs.slice(-maxCount)

  if (latestTabs.some(tab => tab.key === activePath)) {
    return latestTabs
  }

  const activeTab = tabs.find(tab => tab.key === activePath)

  if (!activeTab) {
    return latestTabs
  }

  return [...latestTabs.slice(1), activeTab]
}
