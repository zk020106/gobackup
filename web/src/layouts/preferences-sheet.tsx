import { Copy, Pin, PinOff, RefreshCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, SideSheet, Tooltip } from '@douyinfe/semi-ui-19'

import { getAdminMessages, getPreferenceTabs } from '@/i18n/admin-i18n'
import { cn } from '@/lib/utils'
import { getPreferenceDiff } from '@/layouts/preferences-options'
import {
  AppearancePreferences,
  GeneralPreferences,
  LayoutPreferences,
  ShortcutPreferences
} from '@/layouts/preferences-sections'
import type { PreferenceStoreState } from '@/store/preferences'
import type { AdminPreferences } from '@/types'

type PreferencesSheetProps = {
  onClearCacheLogout: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  preferences: AdminPreferences
  resetPreferences: () => void
  setPreferences: PreferenceStoreState['setPreferences']
}

/**
 * 渲染偏好设置抽屉和全部配置页签。
 */
export function PreferencesSheet({
  onClearCacheLogout,
  onOpenChange,
  open,
  preferences,
  resetPreferences,
  setPreferences
}: PreferencesSheetProps) {
  const messages = getAdminMessages(preferences.appLocale)
  const preferenceTabs = getPreferenceTabs(preferences.appLocale)
  const preferenceDiff = useMemo(() => getPreferenceDiff(preferences), [preferences])
  const hasPreferenceDiff = Object.keys(preferenceDiff).length > 0
  const [activeTab, setActiveTab] = useState<string>('appearance')

  async function copyPreferences() {
    if (!hasPreferenceDiff) {
      return
    }

    await navigator.clipboard?.writeText(JSON.stringify(preferenceDiff, null, 2))
  }

  function handleClearCacheLogout() {
    resetPreferences()
    onOpenChange(false)
    onClearCacheLogout()
  }

  return (
    <SideSheet
      visible={open}
      onCancel={() => onOpenChange(false)}
      placement="right"
      width={390}
      closable={false}
      headerStyle={{ display: 'none' }}
      bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
      className="admin-preferences-sheet text-foreground"
      aria-label={messages.preferences.title}
    >
      <div
        role="dialog"
        aria-label={messages.preferences.title}
        className="flex flex-col h-full w-full bg-background"
      >
        {/* 头部区域 */}
        <div className="relative flex items-start justify-between border-b p-4 pr-12">
          <div>
            <h2 className="text-base font-semibold">{messages.preferences.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {messages.preferences.description}
            </p>
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-1">
            <Tooltip content={messages.preferences.actions.resetTooltip}>
              <Button
                aria-label={messages.preferences.actions.reset}
                className="relative !size-7 !p-0"
                disabled={!hasPreferenceDiff}
                onClick={resetPreferences}
                theme="borderless"
                type="tertiary"
                icon={<RefreshCcw className="size-3.5" />}
              >
                {hasPreferenceDiff ? (
                  <span className="absolute top-1 right-1 size-1.5 rounded-sm bg-primary" />
                ) : null}
              </Button>
            </Tooltip>
            <Tooltip
              content={
                preferences.appEnableStickyPreferencesNavigationBar
                  ? messages.preferences.actions.unpinNavigation
                  : messages.preferences.actions.pinNavigation
              }
            >
              <Button
                aria-label={
                  preferences.appEnableStickyPreferencesNavigationBar
                    ? messages.preferences.actions.unpinNavigation
                    : messages.preferences.actions.pinNavigation
                }
                className="!size-7 !p-0"
                onClick={() =>
                  setPreferences({
                    appEnableStickyPreferencesNavigationBar:
                      !preferences.appEnableStickyPreferencesNavigationBar
                  })
                }
                theme="borderless"
                type="tertiary"
                icon={
                  preferences.appEnableStickyPreferencesNavigationBar ? (
                    <PinOff className="size-3.5" />
                  ) : (
                    <Pin className="size-3.5" />
                  )
                }
              />
            </Tooltip>
            <Button
              aria-label={messages.common.cancel}
              className="!size-7 !p-0"
              onClick={() => onOpenChange(false)}
              theme="borderless"
              type="tertiary"
              icon={<X className="size-4" />}
            />
          </div>
        </div>

        {/* 选项卡导航与内容 */}
        <div
          data-slot="tabs"
          data-orientation="horizontal"
          className="min-h-0 flex-1 flex flex-col data-[orientation=horizontal]:flex-col gap-0"
        >
          <div className="px-4 py-3 border-b bg-muted/20">
            <div
              role="tablist"
              className={cn(
                'grid h-9 w-full rounded-lg bg-muted p-1 text-muted-foreground',
                preferences.appEnableStickyPreferencesNavigationBar && 'sticky top-0 z-20'
              )}
              style={{ gridTemplateColumns: `repeat(${preferenceTabs.length}, minmax(0, 1fr))` }}
            >
              {preferenceTabs.map(tab => (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={activeTab === tab.value}
                  data-state={activeTab === tab.value ? 'active' : 'inactive'}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium cursor-pointer transition-all border-0 bg-transparent text-inherit outline-hidden data-[state=active]:bg-background',
                    activeTab === tab.value
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'hover:text-foreground'
                  )}
                  onClick={() => setActiveTab(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {activeTab === 'appearance' && (
              <AppearancePreferences preferences={preferences} setPreferences={setPreferences} />
            )}
            {activeTab === 'layout' && (
              <LayoutPreferences preferences={preferences} setPreferences={setPreferences} />
            )}
            {activeTab === 'shortcut' && (
              <ShortcutPreferences preferences={preferences} setPreferences={setPreferences} />
            )}
            {activeTab === 'general' && (
              <GeneralPreferences preferences={preferences} setPreferences={setPreferences} />
            )}
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div
          className={cn(
            'grid gap-3 border-t p-4',
            preferences.appEnableCopyPreferences ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          {preferences.appEnableCopyPreferences ? (
            <Button
              disabled={!hasPreferenceDiff}
              onClick={() => void copyPreferences()}
              theme="solid"
              type="primary"
              icon={<Copy className="size-4" />}
            >
              {messages.preferences.actions.copy}
            </Button>
          ) : null}
          <Button onClick={handleClearCacheLogout} theme="borderless" type="tertiary">
            {messages.preferences.actions.clearCacheLogout}
          </Button>
        </div>
      </div>
    </SideSheet>
  )
}
