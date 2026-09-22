import {
  getAdminMessages,
  getHeaderAlignOptions,
  getHeaderModeOptions,
  getLocaleOptions,
  getNavigationStyleOptions,
  getPreferenceButtonPositionOptions,
  getTabbarStyleOptions
} from '@/i18n/admin-i18n'
import {
  PreferenceBlock,
  PreferenceCheckboxGroup,
  PreferenceNumber,
  PreferenceSegmented,
  PreferenceSelect,
  PreferenceText,
  PreferenceToggle
} from '@/layouts/preferences-controls'
import {
  BuiltinThemeGrid,
  ContentModePicker,
  FontSizeStepper,
  LayoutModePicker,
  RadiusPicker,
  ThemeModePicker,
  TransitionPresetPicker
} from '@/layouts/preferences-pickers'
import { preferenceTimezoneOptions } from '@/layouts/preferences-options'
import type { PreferenceStoreState } from '@/store/preferences'
import type { AdminPreferences } from '@/types'

type PreferencesSectionProps = {
  preferences: AdminPreferences
  setPreferences: PreferenceStoreState['setPreferences']
}

/**
 * 渲染偏好设置中的外观配置分组。
 *
 * @param props - 组件属性。
 * @param props.preferences - 当前完整偏好设置。
 * @param props.setPreferences - 偏好设置更新方法。
 * @returns 外观页签内的主题、圆角、字号和辅助显示配置。
 */
export function AppearancePreferences({ preferences, setPreferences }: PreferencesSectionProps) {
  const messages = getAdminMessages(preferences.appLocale)
  const isDarkMode = preferences.colorMode === 'dark'
  const isFullContent = preferences.layout === 'full-content'
  const isDoubleColumnLayout = ['header-mixed-nav', 'sidebar-mixed-nav'].includes(
    preferences.layout
  )
  const darkSidebarDisabled = isDarkMode || preferences.layout === 'header-nav' || isFullContent
  const darkSidebarSubDisabled =
    isDarkMode || !isDoubleColumnLayout || !preferences.themeSemiDarkSidebar

  return (
    <>
      <PreferenceBlock title={messages.preferences.appearance.theme}>
        <ThemeModePicker
          locale={preferences.appLocale}
          mode={preferences.colorMode}
          setMode={colorMode => setPreferences({ colorMode })}
        />
        <PreferenceToggle
          checked={preferences.themeSemiDarkSidebar}
          disabled={darkSidebarDisabled}
          label={messages.preferences.appearance.darkSidebar}
          onCheckedChange={checked =>
            setPreferences({
              themeSemiDarkSidebar: checked,
              themeSemiDarkSidebarSub: checked ? preferences.themeSemiDarkSidebarSub : false
            })
          }
        />
        <PreferenceToggle
          checked={preferences.themeSemiDarkSidebarSub}
          disabled={darkSidebarSubDisabled}
          label={messages.preferences.appearance.darkSidebarSub}
          onCheckedChange={checked => setPreferences({ themeSemiDarkSidebarSub: checked })}
        />
        <PreferenceToggle
          checked={preferences.themeSemiDarkHeader}
          disabled={isDarkMode}
          label={messages.preferences.appearance.darkHeader}
          onCheckedChange={checked => setPreferences({ themeSemiDarkHeader: checked })}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.appearance.builtinTheme}>
        <BuiltinThemeGrid
          activeType={preferences.themeBuiltinType}
          colorPrimary={preferences.themeColorPrimary}
          locale={preferences.appLocale}
          onCustomColorChange={themeColorPrimary =>
            setPreferences({
              themeBuiltinType: 'custom',
              themeColorPrimary
            })
          }
          onSelect={themeBuiltinType => setPreferences({ themeBuiltinType })}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.appearance.radius}>
        <RadiusPicker
          radius={preferences.themeRadius}
          setRadius={themeRadius => setPreferences({ themeRadius })}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.appearance.fontSize}>
        <FontSizeStepper
          fontSize={preferences.themeFontSize}
          locale={preferences.appLocale}
          setFontSize={themeFontSize => setPreferences({ themeFontSize })}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.appearance.other}>
        <PreferenceToggle
          checked={preferences.colorWeakMode}
          label={messages.preferences.appearance.colorWeak}
          onCheckedChange={checked => setPreferences({ colorWeakMode: checked })}
        />
        <PreferenceToggle
          checked={preferences.colorGrayMode}
          label={messages.preferences.appearance.grayMode}
          onCheckedChange={checked => setPreferences({ colorGrayMode: checked })}
        />
      </PreferenceBlock>
    </>
  )
}

/**
 * 渲染偏好设置中的布局配置分组。
 *
 * @param props - 组件属性。
 * @param props.preferences - 当前完整偏好设置。
 * @param props.setPreferences - 偏好设置更新方法。
 * @returns 布局页签内的布局、侧栏、顶栏、导航、面包屑、标签栏和页脚配置。
 */
export function LayoutPreferences({ preferences, setPreferences }: PreferencesSectionProps) {
  const messages = getAdminMessages(preferences.appLocale)
  const headerModeOptions = getHeaderModeOptions(preferences.appLocale)
  const headerAlignOptions = getHeaderAlignOptions(preferences.appLocale)
  const navigationStyleOptions = getNavigationStyleOptions(preferences.appLocale)
  const tabbarStyleOptions = getTabbarStyleOptions(preferences.appLocale)
  const preferenceButtonPositionOptions = getPreferenceButtonPositionOptions(preferences.appLocale)
  const breadcrumbStyleOptions: Array<{
    label: string
    value: AdminPreferences['breadcrumbStyleType']
  }> = [
    { label: messages.common.normal, value: 'normal' },
    { label: messages.common.background, value: 'background' }
  ]
  const isFullContent = preferences.layout === 'full-content'
  const isSideMode = [
    'header-mixed-nav',
    'header-sidebar-nav',
    'mixed-nav',
    'sidebar-mixed-nav',
    'sidebar-nav'
  ].includes(preferences.layout)
  const isMixedLike = ['header-mixed-nav', 'mixed-nav', 'sidebar-mixed-nav'].includes(
    preferences.layout
  )
  const breadcrumbDisabled =
    isFullContent ||
    !['header-sidebar-nav', 'sidebar-mixed-nav', 'sidebar-nav'].includes(preferences.layout)

  return (
    <>
      <PreferenceBlock title={messages.preferences.layout.layout}>
        <LayoutModePicker
          locale={preferences.appLocale}
          layout={preferences.layout}
          setLayout={layout =>
            setPreferences({
              layout,
              sidebarHidden: layout === 'sidebar-mixed-nav' ? false : preferences.sidebarHidden
            })
          }
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.layout.content}>
        <ContentModePicker
          locale={preferences.appLocale}
          mode={preferences.contentCompact}
          setMode={contentCompact => setPreferences({ contentCompact })}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.sidebar.title}>
        <PreferenceToggle
          checked={preferences.sidebarEnable}
          disabled={!isSideMode}
          label={messages.preferences.sidebar.enable}
          onCheckedChange={sidebarEnable => setPreferences({ sidebarEnable })}
        />
        <PreferenceToggle
          checked={preferences.sidebarDraggable}
          disabled={!preferences.sidebarEnable || !isSideMode}
          label={messages.preferences.sidebar.draggable}
          onCheckedChange={sidebarDraggable => setPreferences({ sidebarDraggable })}
        />
        <PreferenceToggle
          checked={preferences.sidebarCollapsed}
          disabled={!preferences.sidebarEnable || !isSideMode}
          label={messages.preferences.sidebar.defaultCollapsed}
          onCheckedChange={sidebarCollapsed => setPreferences({ sidebarCollapsed })}
        />
        <PreferenceToggle
          checked={preferences.sidebarExpandOnHover}
          disabled={!preferences.sidebarEnable || !preferences.sidebarCollapsed || !isSideMode}
          label={messages.preferences.sidebar.expandOnHover}
          onCheckedChange={sidebarExpandOnHover => setPreferences({ sidebarExpandOnHover })}
        />
        <PreferenceToggle
          checked={preferences.sidebarCollapsedShowTitle}
          disabled={!preferences.sidebarEnable || !preferences.sidebarCollapsed || !isSideMode}
          label={messages.preferences.sidebar.collapsedShowTitle}
          onCheckedChange={sidebarCollapsedShowTitle =>
            setPreferences({ sidebarCollapsedShowTitle })
          }
        />
        <PreferenceToggle
          checked={preferences.sidebarAutoActivateChild}
          disabled={!preferences.sidebarEnable || !isMixedLike}
          label={messages.preferences.sidebar.autoActivateChild}
          onCheckedChange={sidebarAutoActivateChild => setPreferences({ sidebarAutoActivateChild })}
        />
        <PreferenceCheckboxGroup
          disabled={!preferences.sidebarEnable || !isSideMode}
          items={[
            { label: messages.preferences.sidebar.collapsedButton, value: 'collapsed' },
            { label: messages.preferences.sidebar.fixedButton, value: 'fixed' }
          ]}
          label={messages.preferences.sidebar.buttons}
          onValuesChange={values =>
            setPreferences({
              sidebarCollapsedButton: values.includes('collapsed'),
              sidebarFixedButton: values.includes('fixed')
            })
          }
          values={[
            ...(preferences.sidebarCollapsedButton ? ['collapsed'] : []),
            ...(preferences.sidebarFixedButton ? ['fixed'] : [])
          ]}
        />
        <PreferenceNumber
          disabled={!preferences.sidebarEnable || !isSideMode}
          label={messages.preferences.sidebar.width}
          locale={preferences.appLocale}
          max={320}
          min={160}
          onValueChange={sidebarWidth => setPreferences({ sidebarWidth })}
          step={10}
          value={preferences.sidebarWidth}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.header.title}>
        <PreferenceToggle
          checked={preferences.headerVisible}
          disabled={isFullContent}
          label={messages.preferences.header.visible}
          onCheckedChange={headerVisible => setPreferences({ headerVisible })}
        />
        <PreferenceSelect
          disabled={!preferences.headerVisible || isFullContent}
          items={headerModeOptions}
          label={messages.preferences.header.mode}
          onValueChange={headerMode => setPreferences({ headerMode })}
          value={preferences.headerMode}
        />
        <PreferenceSegmented
          disabled={!preferences.headerVisible || isFullContent}
          items={headerAlignOptions}
          label={messages.preferences.header.align}
          onValueChange={headerMenuAlign => setPreferences({ headerMenuAlign })}
          value={preferences.headerMenuAlign}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.navigation.title}>
        <PreferenceSegmented
          disabled={isFullContent}
          items={navigationStyleOptions}
          label={messages.preferences.navigation.style}
          onValueChange={navigationStyleType => setPreferences({ navigationStyleType })}
          value={preferences.navigationStyleType}
        />
        <PreferenceToggle
          checked={preferences.navigationSplit}
          disabled={preferences.layout !== 'mixed-nav' || isFullContent}
          label={messages.preferences.navigation.split}
          onCheckedChange={navigationSplit => setPreferences({ navigationSplit })}
        />
        <PreferenceToggle
          checked={preferences.navigationAccordion}
          disabled={isFullContent}
          label={messages.preferences.navigation.accordion}
          onCheckedChange={navigationAccordion => setPreferences({ navigationAccordion })}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.breadcrumb.title}>
        <PreferenceToggle
          checked={preferences.breadcrumbEnable}
          disabled={breadcrumbDisabled}
          label={messages.preferences.breadcrumb.enable}
          onCheckedChange={breadcrumbEnable => setPreferences({ breadcrumbEnable })}
        />
        <PreferenceToggle
          checked={preferences.breadcrumbHideOnlyOne}
          disabled={breadcrumbDisabled || !preferences.breadcrumbEnable}
          label={messages.preferences.breadcrumb.hideOnlyOne}
          onCheckedChange={breadcrumbHideOnlyOne => setPreferences({ breadcrumbHideOnlyOne })}
        />
        <PreferenceToggle
          checked={preferences.breadcrumbShowIcon}
          disabled={breadcrumbDisabled || !preferences.breadcrumbEnable}
          label={messages.preferences.breadcrumb.showIcon}
          onCheckedChange={breadcrumbShowIcon => setPreferences({ breadcrumbShowIcon })}
        />
        <PreferenceToggle
          checked={preferences.breadcrumbShowHome}
          disabled={
            breadcrumbDisabled || !preferences.breadcrumbEnable || !preferences.breadcrumbShowIcon
          }
          label={messages.preferences.breadcrumb.showHome}
          onCheckedChange={breadcrumbShowHome => setPreferences({ breadcrumbShowHome })}
        />
        <PreferenceSegmented
          disabled={breadcrumbDisabled || !preferences.breadcrumbEnable}
          items={breadcrumbStyleOptions}
          label={messages.preferences.breadcrumb.style}
          onValueChange={breadcrumbStyleType => setPreferences({ breadcrumbStyleType })}
          value={preferences.breadcrumbStyleType}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.tabbar.title}>
        <PreferenceToggle
          checked={preferences.tabbarEnable}
          label={messages.preferences.tabbar.enable}
          onCheckedChange={tabbarEnable => setPreferences({ tabbarEnable })}
        />
        <PreferenceToggle
          checked={preferences.tabbarShowIcon}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.showIcon}
          onCheckedChange={tabbarShowIcon => setPreferences({ tabbarShowIcon })}
        />
        <PreferenceToggle
          checked={preferences.tabbarPersist}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.persist}
          onCheckedChange={tabbarPersist => setPreferences({ tabbarPersist })}
        />
        <PreferenceToggle
          checked={preferences.tabbarVisitHistory}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.visitHistory}
          onCheckedChange={tabbarVisitHistory => setPreferences({ tabbarVisitHistory })}
        />
        <PreferenceToggle
          checked={preferences.tabbarDraggable}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.draggable}
          onCheckedChange={tabbarDraggable => setPreferences({ tabbarDraggable })}
        />
        <PreferenceToggle
          checked={preferences.tabbarWheelable}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.wheelable}
          onCheckedChange={tabbarWheelable => setPreferences({ tabbarWheelable })}
        />
        <PreferenceToggle
          checked={preferences.tabbarMiddleClickToClose}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.middleClick}
          onCheckedChange={tabbarMiddleClickToClose => setPreferences({ tabbarMiddleClickToClose })}
        />
        <PreferenceToggle
          checked={preferences.tabbarShowMore}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.showMore}
          onCheckedChange={tabbarShowMore => setPreferences({ tabbarShowMore })}
        />
        <PreferenceToggle
          checked={preferences.tabbarShowRefresh}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.showRefresh}
          onCheckedChange={tabbarShowRefresh => setPreferences({ tabbarShowRefresh })}
        />
        <PreferenceToggle
          checked={preferences.tabbarShowMaximize}
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.showMaximize}
          onCheckedChange={tabbarShowMaximize => setPreferences({ tabbarShowMaximize })}
        />
        <PreferenceSelect
          disabled={!preferences.tabbarEnable}
          items={tabbarStyleOptions}
          label={messages.preferences.tabbar.style}
          onValueChange={tabbarStyleType => setPreferences({ tabbarStyleType })}
          value={preferences.tabbarStyleType}
        />
        <PreferenceNumber
          disabled={!preferences.tabbarEnable}
          label={messages.preferences.tabbar.maxCount}
          locale={preferences.appLocale}
          max={30}
          min={0}
          onValueChange={tabbarMaxCount => setPreferences({ tabbarMaxCount })}
          step={5}
          value={preferences.tabbarMaxCount}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.widgets.title}>
        <PreferenceToggle
          checked={preferences.widgetGlobalSearch}
          label={messages.preferences.widgets.globalSearch}
          onCheckedChange={widgetGlobalSearch => setPreferences({ widgetGlobalSearch })}
        />
        <PreferenceToggle
          checked={preferences.widgetThemeToggle}
          label={messages.preferences.widgets.theme}
          onCheckedChange={widgetThemeToggle => setPreferences({ widgetThemeToggle })}
        />
        <PreferenceToggle
          checked={preferences.widgetLanguageToggle}
          label={messages.preferences.widgets.language}
          onCheckedChange={widgetLanguageToggle => setPreferences({ widgetLanguageToggle })}
        />
        <PreferenceToggle
          checked={preferences.widgetFullscreen}
          label={messages.preferences.widgets.fullscreen}
          onCheckedChange={widgetFullscreen => setPreferences({ widgetFullscreen })}
        />
        <PreferenceToggle
          checked={preferences.widgetNotification}
          label={messages.preferences.widgets.notification}
          onCheckedChange={widgetNotification => setPreferences({ widgetNotification })}
        />
        <PreferenceToggle
          checked={preferences.widgetLockScreen}
          label={messages.preferences.widgets.lockScreen}
          onCheckedChange={widgetLockScreen => setPreferences({ widgetLockScreen })}
        />
        <PreferenceToggle
          checked={preferences.widgetSidebarToggle}
          label={messages.preferences.widgets.sidebarToggle}
          onCheckedChange={widgetSidebarToggle => setPreferences({ widgetSidebarToggle })}
        />
        <PreferenceToggle
          checked={preferences.widgetRefresh}
          label={messages.preferences.widgets.refresh}
          onCheckedChange={widgetRefresh => setPreferences({ widgetRefresh })}
        />
        <PreferenceToggle
          checked={preferences.widgetTimezone}
          label={messages.preferences.widgets.timezone}
          onCheckedChange={widgetTimezone => setPreferences({ widgetTimezone })}
        />
        <PreferenceSelect
          items={preferenceButtonPositionOptions}
          label={messages.preferences.widgets.preferencesButtonPosition}
          onValueChange={appPreferencesButtonPosition =>
            setPreferences({ appPreferencesButtonPosition })
          }
          value={preferences.appPreferencesButtonPosition}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.footer.title}>
        <PreferenceToggle
          checked={preferences.footerEnable}
          label={messages.preferences.footer.enable}
          onCheckedChange={footerEnable => setPreferences({ footerEnable })}
        />
        <PreferenceToggle
          checked={preferences.footerFixed}
          disabled={!preferences.footerEnable}
          label={messages.preferences.footer.fixed}
          onCheckedChange={footerFixed => setPreferences({ footerFixed })}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.copyright.title}>
        <PreferenceToggle
          checked={preferences.copyrightEnable}
          disabled={!preferences.footerEnable}
          label={messages.preferences.copyright.enable}
          onCheckedChange={copyrightEnable => setPreferences({ copyrightEnable })}
        />
        <PreferenceText
          disabled={!preferences.footerEnable || !preferences.copyrightEnable}
          label={messages.preferences.copyright.companyName}
          onValueChange={copyrightCompanyName => setPreferences({ copyrightCompanyName })}
          value={preferences.copyrightCompanyName}
        />
        <PreferenceText
          disabled={!preferences.footerEnable || !preferences.copyrightEnable}
          label={messages.preferences.copyright.companyLink}
          onValueChange={copyrightCompanySiteLink => setPreferences({ copyrightCompanySiteLink })}
          value={preferences.copyrightCompanySiteLink}
        />
        <PreferenceText
          disabled={!preferences.footerEnable || !preferences.copyrightEnable}
          label={messages.preferences.copyright.date}
          onValueChange={copyrightDate => setPreferences({ copyrightDate })}
          value={preferences.copyrightDate}
        />
        <PreferenceText
          disabled={!preferences.footerEnable || !preferences.copyrightEnable}
          label={messages.preferences.copyright.icp}
          onValueChange={copyrightIcp => setPreferences({ copyrightIcp })}
          value={preferences.copyrightIcp}
        />
        <PreferenceText
          disabled={!preferences.footerEnable || !preferences.copyrightEnable}
          label={messages.preferences.copyright.icpLink}
          onValueChange={copyrightIcpLink => setPreferences({ copyrightIcpLink })}
          value={preferences.copyrightIcpLink}
        />
      </PreferenceBlock>
    </>
  )
}

/**
 * 渲染偏好设置中的快捷键配置分组。
 *
 * @param props - 组件属性。
 * @param props.preferences - 当前完整偏好设置。
 * @param props.setPreferences - 偏好设置更新方法。
 * @returns 快捷键页签内的开关列表。
 */
export function ShortcutPreferences({ preferences, setPreferences }: PreferencesSectionProps) {
  const messages = getAdminMessages(preferences.appLocale)

  return (
    <PreferenceBlock title={messages.preferences.shortcut.title}>
      <PreferenceToggle
        checked={preferences.shortcutKeysEnable}
        label={messages.preferences.shortcut.enable}
        onCheckedChange={shortcutKeysEnable => setPreferences({ shortcutKeysEnable })}
      />
      <PreferenceToggle
        checked={preferences.shortcutKeysGlobalSearch}
        disabled={!preferences.shortcutKeysEnable}
        label={messages.preferences.shortcut.globalSearch}
        onCheckedChange={shortcutKeysGlobalSearch => setPreferences({ shortcutKeysGlobalSearch })}
        shortcut="Ctrl / ⌘ K"
      />
      <PreferenceToggle
        checked={preferences.shortcutKeysGlobalLogout}
        disabled={!preferences.shortcutKeysEnable}
        label={messages.preferences.shortcut.logout}
        onCheckedChange={shortcutKeysGlobalLogout => setPreferences({ shortcutKeysGlobalLogout })}
        shortcut="Alt Q"
      />
      <PreferenceToggle
        checked={preferences.shortcutKeysGlobalLockScreen}
        disabled={!preferences.shortcutKeysEnable}
        label={messages.preferences.shortcut.lockScreen}
        onCheckedChange={shortcutKeysGlobalLockScreen =>
          setPreferences({ shortcutKeysGlobalLockScreen })
        }
        shortcut="Alt L"
      />
      <PreferenceToggle
        checked={preferences.shortcutKeysGlobalEscape}
        disabled={!preferences.shortcutKeysEnable}
        label={messages.preferences.shortcut.closeOverlay}
        onCheckedChange={shortcutKeysGlobalEscape => setPreferences({ shortcutKeysGlobalEscape })}
        shortcut="Esc"
      />
    </PreferenceBlock>
  )
}

/**
 * 渲染偏好设置中的通用配置和动画配置分组。
 *
 * @param props - 组件属性。
 * @param props.preferences - 当前完整偏好设置。
 * @param props.setPreferences - 偏好设置更新方法。
 * @returns 通用页签内的基础配置和页面动画配置。
 */
export function GeneralPreferences({ preferences, setPreferences }: PreferencesSectionProps) {
  const messages = getAdminMessages(preferences.appLocale)
  const localeOptions = getLocaleOptions(preferences.appLocale)

  return (
    <>
      <PreferenceBlock title={messages.preferences.general.title}>
        <PreferenceSelect
          items={localeOptions}
          label={messages.preferences.general.language}
          onValueChange={appLocale => setPreferences({ appLocale })}
          value={preferences.appLocale}
        />
        <PreferenceSelect
          items={preferenceTimezoneOptions}
          label={messages.preferences.general.timezone}
          onValueChange={appTimezone => setPreferences({ appTimezone })}
          value={preferences.appTimezone}
        />
        <PreferenceToggle
          checked={preferences.appDynamicTitle}
          label={messages.preferences.general.dynamicTitle}
          onCheckedChange={appDynamicTitle => setPreferences({ appDynamicTitle })}
        />
        <PreferenceToggle
          checked={preferences.appWatermark}
          label={messages.preferences.general.watermark}
          onCheckedChange={appWatermark =>
            setPreferences({
              appWatermark,
              appWatermarkContent: appWatermark
                ? preferences.appWatermarkContent || messages.common.systemName
                : ''
            })
          }
        />
        {preferences.appWatermark ? (
          <PreferenceText
            label={messages.preferences.general.watermarkContent}
            onValueChange={appWatermarkContent => setPreferences({ appWatermarkContent })}
            value={preferences.appWatermarkContent}
          />
        ) : null}
        <PreferenceToggle
          checked={preferences.appEnableCheckUpdates}
          label={messages.preferences.general.checkUpdates}
          onCheckedChange={appEnableCheckUpdates => setPreferences({ appEnableCheckUpdates })}
        />
        <PreferenceToggle
          checked={preferences.appEnableCopyPreferences}
          label={messages.preferences.general.copyPreferences}
          onCheckedChange={appEnableCopyPreferences => setPreferences({ appEnableCopyPreferences })}
        />
      </PreferenceBlock>
      <PreferenceBlock title={messages.preferences.animation.title}>
        <PreferenceToggle
          checked={preferences.transitionProgress}
          label={messages.preferences.animation.progress}
          onCheckedChange={transitionProgress => setPreferences({ transitionProgress })}
        />
        <PreferenceToggle
          checked={preferences.transitionLoading}
          label={messages.preferences.animation.pageLoading}
          onCheckedChange={transitionLoading => setPreferences({ transitionLoading })}
        />
        <PreferenceToggle
          checked={preferences.transitionEnable}
          label={messages.preferences.animation.transition}
          onCheckedChange={transitionEnable =>
            setPreferences({
              animationEnable: transitionEnable,
              transitionEnable
            })
          }
        />
        {preferences.transitionEnable ? (
          <TransitionPresetPicker
            activeName={preferences.transitionName}
            locale={preferences.appLocale}
            onSelect={transitionName => setPreferences({ transitionName })}
          />
        ) : null}
      </PreferenceBlock>
    </>
  )
}
