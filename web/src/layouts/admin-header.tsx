import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Maximize2,
  Minimize2,
  Moon,
  RefreshCcw,
  Search,
  Settings2,
  Sun,
  UserRoundCog
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Badge,
  Button,
  Divider,
  Dropdown,
  Modal,
  Radio,
  RadioGroup,
  Tooltip
} from '@douyinfe/semi-ui-19'

import { AppLogo } from '@/components/app-logo'
import { SidebarTrigger } from '@/layouts/sidebar-context'
import { getAdminMessages, getLocaleOptions } from '@/i18n/admin-i18n'
import { cn } from '@/lib/utils'
import { getMenuRecordIcon, isMenuRecordActive } from '@/layouts/navigation'
import {
  preferenceTimezoneOptions,
  type PreferencesButtonPlacement
} from '@/layouts/preferences-options'
import type { NotificationRecord } from '@/types/admin'
import { ADMIN_DEFAULT_PATH, getDefaultMenuPath, getMenuTitle } from '@/router/app-data'
import { usePreferencesSlice, useSetPreferences } from '@/store/use-preferences'
import type { AdminPreferences, MenuRecord } from '@/types'
import { findMenuTrail } from '@/utils/menu'

type AdminHeaderProps = {
  activePath: string
  activeRootPath: string
  hidden: boolean
  isMobile: boolean
  layout: AdminPreferences['layout']
  menu: MenuRecord[]
  navigate: (path: string) => void
  onLogout: () => void
  onRefresh: () => void
  onSelectRoot: (item: MenuRecord) => void
  openLock: () => void
  openPreferences: () => void
  openSearch: () => void
  preferencesButtonPlacement: PreferencesButtonPlacement
  sidebarEnabled: boolean
}

type HeaderNavigationProps = {
  activePath: string
  activeRootPath: string
  className?: string
  menu: MenuRecord[]
  navigate: (path: string) => void
  onSelectRoot: (item: MenuRecord) => void
  rootOnly?: boolean
  showBrand?: boolean
  systemName: string
  topNavigationLabel: string
}

type HeaderNavigationItemProps = {
  activePath: string
  activeRootPath: string
  item: MenuRecord
  navigate: (path: string) => void
  onSelectRoot: (item: MenuRecord) => void
  rootOnly: boolean
}

type HeaderIconButtonProps = {
  children: ReactNode
  dataPreferencesPosition?: AdminPreferences['appPreferencesButtonPosition']
  label: string
  onClick?: () => void
}

type LanguageDropdownProps = {
  locale: string
  setLocale: (locale: string) => void
}

type TimezoneDialogButtonProps = {
  locale: string
  setTimezone: (timezone: string) => void
  timezone: string
}

type UserMenuProps = {
  locale: string
  lockScreenEnabled: boolean
  onLogout: () => void
  openLock: () => void
  openPreferences: () => void
  showPreferencesItem?: boolean
}

const emptyNotifications: NotificationRecord[] = []

/**
 * 渲染后台顶栏、面包屑、导航和工具按钮。
 */
export function AdminHeader({
  activePath,
  activeRootPath,
  hidden,
  isMobile,
  layout,
  menu,
  navigate,
  onLogout,
  onRefresh,
  onSelectRoot,
  openLock,
  openPreferences,
  openSearch,
  preferencesButtonPlacement,
  sidebarEnabled
}: AdminHeaderProps) {
  const preferences = usePreferencesSlice(preferences => ({
    appLocale: preferences.appLocale,
    appTimezone: preferences.appTimezone,
    breadcrumbEnable: preferences.breadcrumbEnable,
    breadcrumbHideOnlyOne: preferences.breadcrumbHideOnlyOne,
    breadcrumbShowHome: preferences.breadcrumbShowHome,
    breadcrumbShowIcon: preferences.breadcrumbShowIcon,
    breadcrumbStyleType: preferences.breadcrumbStyleType,
    colorMode: preferences.colorMode,
    headerHeight: preferences.headerHeight,
    headerMenuAlign: preferences.headerMenuAlign,
    headerMode: preferences.headerMode,
    navigationSplit: preferences.navigationSplit,
    sidebarEnable: preferences.sidebarEnable,
    sidebarHidden: preferences.sidebarHidden,
    widgetFullscreen: preferences.widgetFullscreen,
    widgetGlobalSearch: preferences.widgetGlobalSearch,
    widgetLanguageToggle: preferences.widgetLanguageToggle,
    widgetLockScreen: preferences.widgetLockScreen,
    widgetNotification: preferences.widgetNotification,
    widgetRefresh: preferences.widgetRefresh,
    widgetThemeToggle: preferences.widgetThemeToggle,
    widgetTimezone: preferences.widgetTimezone
  }))
  const setPreferences = useSetPreferences()
  const messages = getAdminMessages(preferences.appLocale)
  const [browserFullscreen, setBrowserFullscreen] = useState(false)
  const rawTrail = findMenuTrail(menu, activePath) ?? [
    { key: activePath, path: activePath, title: getMenuTitle(activePath, menu) }
  ]
  const homeTrail = preferences.breadcrumbShowHome
    ? [
        { key: '__home', path: ADMIN_DEFAULT_PATH, title: messages.common.home },
        ...rawTrail.filter(item => item.path !== ADMIN_DEFAULT_PATH)
      ]
    : rawTrail
  const trail = preferences.breadcrumbHideOnlyOne && homeTrail.length <= 1 ? [] : homeTrail
  const isDark = preferences.colorMode === 'dark'
  const headerNavigationEnabled =
    !isMobile && ['header-mixed-nav', 'header-nav', 'mixed-nav'].includes(layout)
  const headerNavigationRootOnly =
    !isMobile &&
    (layout === 'header-mixed-nav' || (layout === 'mixed-nav' && preferences.navigationSplit))
  const headerFullWidth = layout === 'header-sidebar-nav'
  const headerInlineBrandVisible =
    !isMobile &&
    (['header-mixed-nav', 'header-nav', 'header-sidebar-nav'].includes(layout) ||
      (layout === 'mixed-nav' && !sidebarEnabled))
  const headerInlineBrandStyle =
    layout === 'header-sidebar-nav'
      ? ({ minWidth: 'var(--admin-header-brand-width)' } as CSSProperties)
      : undefined
  const mobileHeaderLogoVisible = isMobile
  const headerJustifyClass =
    preferences.headerMenuAlign === 'center'
      ? 'justify-center'
      : preferences.headerMenuAlign === 'end'
        ? 'justify-end'
        : 'justify-start'
  const fixedHeader = ['auto', 'auto-scroll', 'fixed'].includes(preferences.headerMode)
  const mobileSidebarTriggerVisible =
    isMobile &&
    sidebarEnabled &&
    preferences.sidebarEnable &&
    !preferences.sidebarHidden &&
    layout !== 'full-content'

  useEffect(() => {
    function handleFullscreenChange() {
      setBrowserFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    handleFullscreenChange()

    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  function toggleBrowserFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
      return
    }

    void document.documentElement.requestFullscreen?.()
  }

  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-2 border-b bg-header px-3 text-[hsl(var(--header-foreground,var(--foreground)))] transition-[margin-top,transform] duration-200',
        fixedHeader && 'sticky top-0 z-20',
        hidden && '-mt-(--admin-header-height)',
        headerFullWidth && 'admin-header-full-width'
      )}
      data-slot="admin-header"
      style={{ height: preferences.headerHeight }}
    >
      {mobileHeaderLogoVisible && (
        <div
          className="flex h-full w-10 shrink-0 items-center justify-center"
          data-slot="admin-header-mobile-brand"
        >
          <AppLogo size="sm" />
        </div>
      )}
      {mobileSidebarTriggerVisible && (
        <SidebarTrigger aria-label={messages.header.openMenu} className="md:hidden" />
      )}
      {headerInlineBrandVisible && (
        <>
          <div
            className="hidden shrink-0 items-center gap-2 md:flex"
            data-slot="admin-header-inline-brand"
            style={headerInlineBrandStyle}
          >
            <AppLogo size="sm" />
            <span className="text-sm font-semibold">{messages.common.systemName}</span>
          </div>
          <Divider layout="vertical" className="!h-5 hidden md:block !mx-1" />
        </>
      )}
      {preferences.widgetRefresh && (
        <HeaderIconButton label={messages.header.refresh} onClick={onRefresh}>
          <RefreshCcw className="size-4" />
        </HeaderIconButton>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="sr-only">{messages.common.systemName}</h1>
        {headerNavigationEnabled ? (
          <HeaderNavigation
            activePath={activePath}
            activeRootPath={activeRootPath}
            className={headerJustifyClass}
            menu={menu}
            navigate={navigate}
            onSelectRoot={onSelectRoot}
            rootOnly={headerNavigationRootOnly}
            showBrand={false}
            systemName={messages.common.systemName}
            topNavigationLabel={messages.header.topNavigation}
          />
        ) : !isMobile && preferences.breadcrumbEnable && trail.length > 0 ? (
          <nav
            aria-label={messages.header.breadcrumb}
            className={cn(
              'hidden items-center gap-1 text-sm text-muted-foreground md:flex',
              preferences.breadcrumbStyleType === 'background' && 'rounded-md bg-accent px-2 py-1'
            )}
          >
            {trail.map((item, index) => (
              <span className="inline-flex items-center gap-1" key={item.key}>
                {index > 0 && <ChevronRight className="size-3" />}
                {preferences.breadcrumbShowIcon && index === 0 && (
                  <LayoutDashboard className="size-3.5" />
                )}
                <span className={index === trail.length - 1 ? 'text-foreground font-medium' : ''}>
                  {item.title}
                </span>
              </span>
            ))}
          </nav>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
      </div>
      {preferences.widgetGlobalSearch && (
        <HeaderIconButton label={messages.header.search} onClick={openSearch}>
          <Search className="size-4" />
        </HeaderIconButton>
      )}
      {preferencesButtonPlacement.header && (
        <HeaderIconButton
          dataPreferencesPosition="header"
          label={messages.header.preferences}
          onClick={openPreferences}
        >
          <Settings2 className="size-4" />
        </HeaderIconButton>
      )}
      {preferencesButtonPlacement.header && preferences.widgetThemeToggle && (
        <HeaderIconButton
          label={isDark ? messages.header.lightMode : messages.header.darkMode}
          onClick={() => setPreferences({ colorMode: isDark ? 'light' : 'dark' })}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </HeaderIconButton>
      )}
      {preferencesButtonPlacement.header && preferences.widgetLanguageToggle && (
        <LanguageDropdown
          locale={preferences.appLocale}
          setLocale={appLocale => setPreferences({ appLocale })}
        />
      )}
      {preferencesButtonPlacement.header && preferences.widgetTimezone && (
        <TimezoneDialogButton
          locale={preferences.appLocale}
          setTimezone={appTimezone => setPreferences({ appTimezone })}
          timezone={preferences.appTimezone}
        />
      )}
      {preferences.widgetFullscreen && (
        <HeaderIconButton
          label={browserFullscreen ? messages.header.exitFullscreen : messages.header.fullscreen}
          onClick={toggleBrowserFullscreen}
        >
          {browserFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </HeaderIconButton>
      )}
      {preferences.widgetNotification && <NotificationsMenu locale={preferences.appLocale} />}
      <UserMenu
        locale={preferences.appLocale}
        lockScreenEnabled={preferences.widgetLockScreen}
        onLogout={onLogout}
        openLock={openLock}
        openPreferences={openPreferences}
        showPreferencesItem={preferencesButtonPlacement.userDropdown}
      />
    </header>
  )
}

function HeaderNavigation({
  activePath,
  activeRootPath,
  className,
  menu,
  navigate,
  onSelectRoot,
  rootOnly = false,
  showBrand = true,
  systemName,
  topNavigationLabel
}: HeaderNavigationProps) {
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-3', className)}>
      {showBrand && (
        <>
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <AppLogo size="sm" />
            <span className="text-sm font-semibold">{systemName}</span>
          </div>
          <Divider layout="vertical" className="!h-5 hidden md:block !mx-1" />
        </>
      )}
      <nav
        aria-label={topNavigationLabel}
        className="admin-header-nav-scroll flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden"
      >
        {menu.map(item => (
          <HeaderNavigationItem
            activePath={activePath}
            activeRootPath={activeRootPath}
            item={item}
            key={item.key}
            navigate={navigate}
            onSelectRoot={onSelectRoot}
            rootOnly={rootOnly}
          />
        ))}
      </nav>
    </div>
  )
}

function HeaderNavigationItem({
  activePath,
  activeRootPath,
  item,
  navigate,
  onSelectRoot,
  rootOnly
}: HeaderNavigationItemProps) {
  const Icon = getMenuRecordIcon(item)
  const children = item.children ?? []
  const isActive = rootOnly ? activeRootPath === item.path : isMenuRecordActive(item, activePath)

  if (rootOnly || children.length === 0) {
    const targetPath = rootOnly ? getDefaultMenuPath(item) : item.path

    return (
      <Button
        className={cn(
          'h-8 gap-1.5 px-2 text-muted-foreground !rounded-md text-xs font-normal',
          isActive && '!bg-muted !text-foreground font-medium'
        )}
        onClick={() => (rootOnly ? onSelectRoot(item) : navigate(targetPath))}
        theme="borderless"
        type="tertiary"
        icon={Icon && <Icon className="size-4" />}
      >
        <span>{item.title}</span>
        {item.badge && <Badge count={item.badge} type="secondary" />}
      </Button>
    )
  }

  if (children.length > 0) {
    return (
      <Dropdown
        position="bottomLeft"
        render={
          <Dropdown.Menu className="w-48">
            <Dropdown.Title>{item.title}</Dropdown.Title>
            <Dropdown.Divider />
            {children.map(child => {
              const ChildIcon = getMenuRecordIcon(child)
              const childActive = isMenuRecordActive(child, activePath)

              return (
                <Dropdown.Item
                  key={child.key}
                  className={cn(childActive && '!bg-primary/10 !text-primary font-medium')}
                  icon={ChildIcon && <ChildIcon className="size-4" />}
                  onClick={() => navigate(child.path)}
                >
                  <span className="flex items-center justify-between w-full gap-2">
                    <span>{child.title}</span>
                    {child.badge && <Badge count={child.badge} type="secondary" />}
                  </span>
                </Dropdown.Item>
              )
            })}
          </Dropdown.Menu>
        }
      >
        <Button
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'h-8 gap-1.5 px-2 text-muted-foreground !rounded-md text-xs font-normal',
            isActive && '!bg-muted !text-foreground font-medium'
          )}
          theme="borderless"
          type="tertiary"
          icon={Icon && <Icon className="size-4" />}
        >
          <span>{item.title}</span>
          <ChevronDown className="size-3" />
        </Button>
      </Dropdown>
    )
  }

  return null
}

function HeaderIconButton({
  children,
  dataPreferencesPosition,
  label,
  onClick
}: HeaderIconButtonProps) {
  return (
    <Tooltip content={label}>
      <Button
        aria-label={label}
        className="admin-header-icon-button !p-0 size-8 !rounded-md"
        data-preferences-position={dataPreferencesPosition}
        onClick={onClick}
        theme="borderless"
        type="tertiary"
      >
        {children}
      </Button>
    </Tooltip>
  )
}

function LanguageDropdown({ locale, setLocale }: LanguageDropdownProps) {
  const messages = getAdminMessages(locale)
  const localeOptions = getLocaleOptions(locale)

  return (
    <Dropdown
      position="bottomRight"
      trigger="click"
      render={
        <Dropdown.Menu className="w-40">
          <Dropdown.Title>{messages.header.language}</Dropdown.Title>
          <Dropdown.Divider />
          {localeOptions.map(item => (
            <Dropdown.Item
              key={item.value}
              {...({ 'aria-checked': locale === item.value, role: 'menuitemradio' } as any)}
              selected={locale === item.value}
              active={locale === item.value}
              onClick={() => setLocale(item.value)}
            >
              {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      }
    >
      <Button
        aria-label={messages.header.language}
        className="admin-header-icon-button !p-0 size-8 !rounded-md"
        theme="borderless"
        type="tertiary"
        icon={<Globe2 className="size-4" />}
      />
    </Dropdown>
  )
}

function TimezoneDialogButton({ locale, setTimezone, timezone }: TimezoneDialogButtonProps) {
  const messages = getAdminMessages(locale)
  const [open, setOpen] = useState(false)
  const [draftTimezone, setDraftTimezone] = useState(timezone)

  function confirmTimezone() {
    setTimezone(draftTimezone)
    setOpen(false)
  }

  function openTimezoneDialog() {
    setDraftTimezone(timezone)
    setOpen(true)
  }

  return (
    <>
      <HeaderIconButton label={messages.header.timezone} onClick={openTimezoneDialog}>
        <Clock3 className="size-4" />
      </HeaderIconButton>
      <Modal
        motion={false}
        title={messages.header.timezoneTitle}
        visible={open}
        onCancel={() => setOpen(false)}
        onOk={confirmTimezone}
        okText={messages.common.confirm}
        cancelText={messages.common.cancel}
        okButtonProps={{ 'aria-label': messages.common.confirm } as any}
        cancelButtonProps={{ 'aria-label': messages.common.cancel } as any}
      >
        <p className="text-xs text-muted-foreground mb-3">{messages.header.timezoneDescription}</p>
        <RadioGroup
          value={draftTimezone}
          onChange={e => setDraftTimezone(e.target.value)}
          direction="vertical"
          className="w-full gap-2"
        >
          {preferenceTimezoneOptions.map(item => (
            <Radio key={item.value} value={item.value} className="py-1">
              {item.label}
            </Radio>
          ))}
        </RadioGroup>
      </Modal>
    </>
  )
}

function NotificationsMenu({ locale }: { locale: string }) {
  const messages = getAdminMessages(locale)
  const data = emptyNotifications
  const unreadCount = useMemo(() => data.filter(item => item.status === 'unread').length, [data])

  return (
    <Dropdown
      position="bottomRight"
      trigger="click"
      render={
        <Dropdown.Menu className="w-80 max-w-[90vw]">
          <Dropdown.Title>{messages.header.notifications}</Dropdown.Title>
          <Dropdown.Divider />
          {data.length > 0 ? (
            data.map(item => (
              <Dropdown.Item key={item.id} className="items-start gap-2 whitespace-normal py-2">
                <CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" />
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </div>
              </Dropdown.Item>
            ))
          ) : (
            <Dropdown.Item disabled>暂无通知</Dropdown.Item>
          )}
        </Dropdown.Menu>
      }
    >
      <Button
        aria-label={messages.header.notifications}
        className="admin-header-icon-button relative !p-0 size-8 !rounded-md"
        theme="borderless"
        type="tertiary"
        icon={<Bell className="size-4" />}
      >
        {unreadCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
        ) : null}
      </Button>
    </Dropdown>
  )
}

function UserMenu({
  locale,
  lockScreenEnabled,
  onLogout,
  openLock,
  openPreferences,
  showPreferencesItem = false
}: UserMenuProps) {
  const messages = getAdminMessages(locale)

  return (
    <Dropdown
      position="bottomRight"
      trigger="click"
      render={
        <Dropdown.Menu className="w-48">
          <Dropdown.Title>Root Admin</Dropdown.Title>
          <Dropdown.Divider />
          <Dropdown.Item icon={<UserRoundCog className="size-4" />}>
            {messages.header.userProfile}
          </Dropdown.Item>
          {showPreferencesItem && (
            <Dropdown.Item
              data-preferences-position="user-dropdown"
              icon={<Settings2 className="size-4" />}
              onClick={openPreferences}
            >
              {messages.header.preferences}
            </Dropdown.Item>
          )}
          {lockScreenEnabled && (
            <Dropdown.Item icon={<LockKeyhole className="size-4" />} onClick={openLock}>
              {messages.header.lockScreen}
            </Dropdown.Item>
          )}
          <Dropdown.Divider />
          <Dropdown.Item type="danger" icon={<LogOut className="size-4" />} onClick={onLogout}>
            {messages.header.logout}
          </Dropdown.Item>
        </Dropdown.Menu>
      }
    >
      <Button
        aria-label={messages.header.userMenu}
        className="admin-header-icon-button !p-0 size-8 !rounded-md"
        theme="borderless"
        type="tertiary"
        icon={<CircleUserRound className="size-5" />}
      />
    </Dropdown>
  )
}
