import type { AdminPreferences } from '@/types'

export type AdminLocale = 'en-US' | 'zh-CN'
export type PreferenceTabValue = 'appearance' | 'general' | 'layout' | 'shortcut'

const layoutValues: AdminPreferences['layout'][] = [
  'sidebar-nav',
  'sidebar-mixed-nav',
  'header-nav',
  'header-sidebar-nav',
  'mixed-nav',
  'header-mixed-nav',
  'full-content'
]

const colorModeValues: AdminPreferences['colorMode'][] = ['light', 'dark', 'system']
const contentValues: AdminPreferences['contentCompact'][] = ['wide', 'compact']
const navigationStyleValues: AdminPreferences['navigationStyleType'][] = ['rounded', 'plain']
const headerModeValues: AdminPreferences['headerMode'][] = [
  'static',
  'fixed',
  'auto',
  'auto-scroll'
]
const headerAlignValues: AdminPreferences['headerMenuAlign'][] = ['start', 'center', 'end']
const tabbarStyleValues: AdminPreferences['tabbarStyleType'][] = [
  'chrome',
  'plain',
  'card',
  'brisk'
]
const preferenceButtonPositionValues: AdminPreferences['appPreferencesButtonPosition'][] = [
  'auto',
  'header',
  'fixed',
  'user-dropdown'
]
const preferenceTabValues: PreferenceTabValue[] = ['appearance', 'layout', 'shortcut', 'general']

export const adminMessages = {
  'en-US': {
    common: {
      background: 'Background',
      cancel: 'Cancel',
      confirm: 'Confirm',
      decrease: 'Decrease',
      home: 'Home',
      normal: 'Normal',
      ready: 'Ready',
      systemName: 'GoBackup'
    },
    header: {
      breadcrumb: 'Breadcrumb',
      darkMode: 'Dark mode',
      exitFullscreen: 'Exit fullscreen',
      fullscreen: 'Fullscreen',
      language: 'Language',
      lightMode: 'Light mode',
      notifications: 'Notifications',
      notificationItems: ['Audit policy updated', 'New role pending review', 'Query cache warmed'],
      openMenu: 'Open menu',
      preferences: 'Preferences',
      refresh: 'Refresh',
      search: 'Search',
      timezone: 'Timezone',
      timezoneDescription: 'Choose the timezone used in the current session.',
      timezoneTitle: 'Set timezone',
      topNavigation: 'Top navigation',
      userMenu: 'User menu',
      userProfile: 'Profile',
      logout: 'Log out',
      lockScreen: 'Lock screen'
    },
    navigation: {
      headerMixedSidebar: 'Mixed sidebar navigation',
      mixedMain: 'Mixed main navigation',
      mixedSecondary: 'Mixed secondary navigation',
      navigationMenu: 'Navigation menu',
      sidebar: 'Sidebar navigation',
      sidebarSheet: 'Sidebar',
      toggleSidebar: 'Toggle sidebar',
      collapseSecondary: 'Collapse secondary menu',
      expandSecondary: 'Expand secondary menu',
      fixSecondary: 'Pin secondary menu',
      hoverSecondary: 'Switch to hover secondary menu'
    },
    options: {
      colorMode: {
        dark: 'Dark',
        light: 'Light',
        system: 'System'
      },
      content: {
        compact: 'Compact',
        wide: 'Wide'
      },
      headerAlign: {
        center: 'Center',
        end: 'Right',
        start: 'Left'
      },
      headerMode: {
        auto: 'Auto',
        'auto-scroll': 'Hide on scroll',
        fixed: 'Fixed',
        static: 'Static'
      },
      layout: {
        'full-content': {
          label: 'Full content',
          tip: 'Hide all navigation and show only the page content.'
        },
        'header-mixed-nav': {
          label: 'Mixed double column',
          tip: 'Combine double-column and horizontal navigation.'
        },
        'header-nav': {
          label: 'Horizontal',
          tip: 'Show all menus in the header.'
        },
        'header-sidebar-nav': {
          label: 'Sidebar navigation',
          tip: 'Full-width header with sidebar navigation.'
        },
        'mixed-nav': {
          label: 'Mixed vertical',
          tip: 'Use vertical and horizontal navigation together.'
        },
        'sidebar-mixed-nav': {
          label: 'Double column',
          tip: 'Vertical double-column navigation.'
        },
        'sidebar-nav': {
          label: 'Vertical',
          tip: 'Sidebar vertical menu mode.'
        }
      },
      locale: {
        'en-US': 'English',
        'zh-CN': 'Simplified Chinese'
      },
      navigationStyle: {
        plain: 'Plain',
        rounded: 'Rounded'
      },
      preferenceButtonPosition: {
        auto: 'Auto',
        fixed: 'Fixed button',
        header: 'Header',
        'user-dropdown': 'User dropdown'
      },
      preferenceTab: {
        appearance: 'Appearance',
        general: 'General',
        layout: 'Layout',
        shortcut: 'Shortcuts'
      },
      tabbarStyle: {
        brisk: 'Brisk',
        card: 'Card',
        chrome: 'Chrome',
        plain: 'Plain'
      },
      themePreset: {
        custom: 'Custom',
        'cyber-blue': 'Cyber Blue',
        'deep-blue': 'Deep blue',
        'deep-green': 'Deep green',
        default: 'Default',
        gray: 'Gray',
        green: 'Green',
        neutral: 'Neutral',
        orange: 'Orange',
        pink: 'Pink',
        rose: 'Rose',
        'sky-blue': 'Sky blue',
        slate: 'Slate',
        violet: 'Violet',
        yellow: 'Yellow',
        zinc: 'Zinc'
      }
    },
    pages: {
      audit: {
        description: 'A timeline for route, account, and system operations.',
        events: ['User role changed', 'Preferences exported', 'Drawer task confirmed'],
        title: 'Audit Log'
      },
      dashboard: {
        actionDescription: 'Layout capabilities provided by React Admin modules.',
        actionItems: ['Global search', 'Preferences drawer', 'Theme switch', 'Lock screen'],
        actionTitle: 'Quick actions',
        metricItems: ['Menu routes', 'Tab cache', 'Popup API'],
        overviewDescription: 'Live query data rendered by TanStack Query.',
        overviewTitle: 'Runtime overview',
        stats: [
          { label: 'Online sessions', trend: '+18.2%', value: '24,892' },
          { label: 'Query cache hits', trend: '+6.4%', value: '96.8%' },
          { label: 'Pending alerts', trend: '-3', value: '17' },
          { label: 'Avg. response', trend: '-24ms', value: '184ms' }
        ]
      },
      iframe: {
        description: 'Iframe shell placeholder for route cache scenarios.',
        placeholder: 'Embedded workspace',
        title: 'Embedded Page'
      },
      popup: {
        closeDrawer: 'Close drawer',
        confirm: 'Confirm',
        description: 'Supports chained calls, shared data, locked state, and before-close hooks.',
        drawerSource: 'Drawer',
        drawerSourceKey: 'Source',
        drawerTitle: 'Drawer task',
        lock: 'Lock',
        modalSource: 'Modal',
        modalSourceKey: 'Source',
        modalTitle: 'Edit profile',
        openDrawer: 'Open drawer',
        openModal: 'Open modal',
        payload: 'Payload',
        title: 'Modal & Drawer'
      },
      roles: {
        description: 'Role groups ready to connect to an authorization system.',
        detail: 'Access configuration grouped by responsibility',
        roles: ['Owner', 'Operator', 'Auditor'],
        title: 'Roles'
      },
      schemaForm: {
        defaultRole: 'Owner',
        description: 'A React Admin FormApi surface built with react-hook-form and zod.',
        email: 'Email',
        name: 'Name',
        reset: 'Reset',
        role: 'Role',
        submit: 'Submit',
        title: 'Schema Form'
      },
      users: {
        columns: {
          email: 'Email',
          role: 'Role',
          status: 'Status',
          team: 'Team'
        },
        description: 'Table actions, badges, and dense browsing states.',
        rows: [
          { email: 'root@example.com', role: 'Owner', status: 'Enabled', team: 'Platform' },
          { email: 'ops@example.com', role: 'Operator', status: 'Enabled', team: 'Operations' },
          {
            email: 'audit@example.com',
            role: 'Auditor',
            status: 'In review',
            team: 'Risk control'
          }
        ],
        title: 'Users'
      },
      workplace: {
        description: 'A compact task queue for frequent admin operations.',
        items: ['Pending approval', 'Route cache', 'Pinned tabs'],
        title: 'Workplace'
      }
    },
    preferences: {
      actions: {
        clearCacheLogout: 'Clear cache & log out',
        copy: 'Copy preferences',
        customThemeColor: 'Custom theme color',
        pinNavigation: 'Pin preferences navigation',
        reset: 'Reset preferences',
        resetTooltip: 'Reset preferences',
        unpinNavigation: 'Unpin preferences navigation'
      },
      animation: {
        pageLoading: 'Page loading',
        progress: 'Page loading progress',
        title: 'Animation',
        transition: 'Page transition animation'
      },
      appearance: {
        builtinTheme: 'Built-in themes',
        colorWeak: 'Color weak mode',
        darkHeader: 'Dark header',
        darkSidebar: 'Dark sidebar',
        darkSidebarSub: 'Dark sidebar sub column',
        fontSize: 'Font size',
        fontSizeDescription: 'Adjust the global font size and preview it immediately.',
        other: 'Other',
        radius: 'Radius',
        theme: 'Theme',
        grayMode: 'Gray mode'
      },
      breadcrumb: {
        enable: 'Show breadcrumb',
        hideOnlyOne: 'Hide when only one item',
        showHome: 'Show home',
        showIcon: 'Show icon',
        style: 'Breadcrumb style',
        title: 'Breadcrumb'
      },
      copyright: {
        companyLink: 'Company link',
        companyName: 'Company name',
        date: 'Copyright year',
        enable: 'Show copyright',
        icp: 'ICP number',
        icpLink: 'ICP link',
        title: 'Copyright'
      },
      description: 'Adjust theme, navigation, layout, and interface widgets.',
      footer: {
        enable: 'Show footer',
        fixed: 'Fixed footer',
        title: 'Footer'
      },
      general: {
        checkUpdates: 'Enable update checks',
        copyPreferences: 'Allow copying preferences',
        dynamicTitle: 'Dynamic title',
        language: 'Language',
        timezone: 'Timezone',
        title: 'General',
        watermark: 'Watermark',
        watermarkContent: 'Watermark content'
      },
      header: {
        align: 'Menu position',
        mode: 'Display mode',
        title: 'Header',
        visible: 'Show header'
      },
      layout: {
        content: 'Content',
        layout: 'Layout'
      },
      navigation: {
        accordion: 'Accordion mode',
        split: 'Split menu',
        style: 'Menu style',
        title: 'Navigation menu'
      },
      shortcut: {
        closeOverlay: 'Esc close overlays',
        enable: 'Enable shortcuts',
        globalSearch: 'Global search',
        lockScreen: 'Lock screen',
        logout: 'Log out',
        title: 'Global shortcuts'
      },
      sidebar: {
        autoActivateChild: 'Auto activate submenu',
        buttons: 'Sidebar buttons',
        collapsedButton: 'Collapse button',
        collapsedShowTitle: 'Show title when collapsed',
        draggable: 'Allow width drag',
        enable: 'Show sidebar',
        expandOnHover: 'Expand on hover',
        fixedButton: 'Fixed button',
        title: 'Sidebar',
        width: 'Sidebar width',
        defaultCollapsed: 'Collapsed by default'
      },
      tabbar: {
        draggable: 'Allow drag sorting',
        enable: 'Show tabs',
        maxCount: 'Max tabs',
        middleClick: 'Middle click closes tab',
        persist: 'Persist tabs',
        showIcon: 'Show tab icons',
        showMaximize: 'Show maximize button',
        showMore: 'Show more button',
        showRefresh: 'Show refresh button',
        style: 'Tab style',
        title: 'Tabs',
        visitHistory: 'Visit history',
        wheelable: 'Mouse wheel switches tabs'
      },
      title: 'Preferences',
      widgets: {
        fullscreen: 'Fullscreen button',
        globalSearch: 'Global search',
        language: 'Language switch',
        lockScreen: 'Lock screen button',
        notification: 'Notification button',
        preferencesButtonPosition: 'Preferences button position',
        refresh: 'Refresh button',
        sidebarToggle: 'Sidebar collapse button',
        theme: 'Theme switch',
        timezone: 'Timezone button',
        title: 'Interface features'
      }
    },
    search: {
      empty: 'No routes found.',
      group: 'Routes',
      placeholder: 'Search routes',
      title: 'Global Search'
    },
    tabbar: {
      close: 'Close',
      closeAll: 'Close all',
      closeCurrent: 'Close {title}',
      closeLeft: 'Close left',
      closeOther: 'Close others',
      closeRight: 'Close right',
      copyPath: 'Copy path',
      maximize: 'Maximize',
      maximizeContent: 'Maximize content',
      more: 'More tab actions',
      openNewWindow: 'Open in new window',
      pin: 'Pin',
      refresh: 'Reload',
      refreshCurrent: 'Refresh current tab',
      restoreContent: 'Restore content',
      restoreMaximize: 'Restore maximize',
      unpin: 'Unpin'
    },
    lock: {
      back: 'Back',
      description:
        'Set a lock-screen password for this session. You need it to return to the system.',
      error: 'Incorrect password. Please try again.',
      password: 'Lock password',
      placeholder: 'Enter lock password',
      screenTitle: 'Lock screen',
      submit: 'Enter system',
      title: 'Lock screen',
      unlock: 'Unlock'
    }
  },
  'zh-CN': {
    common: {
      background: '背景',
      cancel: '取消',
      confirm: '确定',
      decrease: '减小',
      home: '首页',
      normal: '普通',
      ready: '已就绪',
      systemName: 'GoBackup'
    },
    header: {
      breadcrumb: '面包屑',
      darkMode: '深色模式',
      exitFullscreen: '退出全屏',
      fullscreen: '全屏',
      language: '语言',
      lightMode: '浅色模式',
      notifications: '通知',
      notificationItems: ['审计策略已更新', '新角色等待复核', '查询缓存已预热'],
      openMenu: '打开菜单',
      preferences: '偏好设置',
      refresh: '刷新',
      search: '搜索',
      timezone: '时区',
      timezoneDescription: '选择当前会话使用的时区。',
      timezoneTitle: '设置时区',
      topNavigation: '顶部导航',
      userMenu: '用户菜单',
      userProfile: '个人资料',
      logout: '退出登录',
      lockScreen: '锁定屏幕'
    },
    navigation: {
      headerMixedSidebar: '混合侧栏导航',
      mixedMain: '混合主导航',
      mixedSecondary: '混合次级导航',
      navigationMenu: '导航菜单',
      sidebar: '侧栏导航',
      sidebarSheet: '侧边栏',
      toggleSidebar: '切换侧边栏',
      collapseSecondary: '折叠次级菜单',
      expandSecondary: '展开次级菜单',
      fixSecondary: '固定次级菜单',
      hoverSecondary: '切换为悬停展开次级菜单'
    },
    options: {
      colorMode: {
        dark: '深色',
        light: '浅色',
        system: '跟随系统'
      },
      content: {
        compact: '紧凑',
        wide: '宽松'
      },
      headerAlign: {
        center: '中',
        end: '右',
        start: '左'
      },
      headerMode: {
        auto: '自动',
        'auto-scroll': '滚动隐藏',
        fixed: '固定',
        static: '静态'
      },
      layout: {
        'full-content': {
          label: '内容全屏',
          tip: '不显示任何菜单，只显示内容主体'
        },
        'header-mixed-nav': {
          label: '混合双列',
          tip: '双列、水平菜单共存模式'
        },
        'header-nav': {
          label: '水平',
          tip: '水平菜单模式，菜单全部显示在顶部'
        },
        'header-sidebar-nav': {
          label: '侧边导航',
          tip: '顶部通栏，侧边导航模式'
        },
        'mixed-nav': {
          label: '混合垂直',
          tip: '垂直水平菜单共存'
        },
        'sidebar-mixed-nav': {
          label: '双列菜单',
          tip: '垂直双列菜单模式'
        },
        'sidebar-nav': {
          label: '垂直',
          tip: '侧边垂直菜单模式'
        }
      },
      locale: {
        'en-US': 'English',
        'zh-CN': '简体中文'
      },
      navigationStyle: {
        plain: '朴素',
        rounded: '圆润'
      },
      preferenceButtonPosition: {
        auto: '自动',
        fixed: '固定按钮',
        header: '顶部栏',
        'user-dropdown': '用户下拉菜单'
      },
      preferenceTab: {
        appearance: '外观',
        general: '通用',
        layout: '布局',
        shortcut: '快捷键'
      },
      tabbarStyle: {
        brisk: '轻快',
        card: '卡片',
        chrome: 'Chrome',
        plain: '朴素'
      },
      themePreset: {
        custom: '自定义',
        'cyber-blue': '极光科技',
        'deep-blue': '深蓝',
        'deep-green': '深绿',
        default: '默认',
        gray: '灰色',
        green: '绿色',
        neutral: '中性色',
        orange: '橙色',
        pink: '粉色',
        rose: '玫瑰',
        'sky-blue': '天蓝',
        slate: '石板色',
        violet: '紫罗兰',
        yellow: '黄色',
        zinc: '锌灰'
      }
    },
    pages: {
      audit: {
        description: '记录路由、账号和系统操作的时间线。',
        events: ['用户角色已变更', '偏好设置已导出', '抽屉任务已确认'],
        title: '审计日志'
      },
      dashboard: {
        actionDescription: '由 React Admin 模块提供的布局组件能力。',
        actionItems: ['全局搜索', '偏好抽屉', '主题切换', '锁屏'],
        actionTitle: '快捷操作',
        metricItems: ['菜单路由', '标签缓存', '弹窗 API'],
        overviewDescription: '通过 TanStack Query 渲染的实时查询数据。',
        overviewTitle: '运行概览',
        stats: [
          { label: '在线会话', trend: '+18.2%', value: '24,892' },
          { label: '查询缓存命中', trend: '+6.4%', value: '96.8%' },
          { label: '待处理告警', trend: '-3', value: '17' },
          { label: '平均响应', trend: '-24ms', value: '184ms' }
        ]
      },
      iframe: {
        description: '用于路由缓存场景的 iframe 外壳占位。',
        placeholder: '内嵌工作区',
        title: '内嵌页面'
      },
      popup: {
        closeDrawer: '关闭抽屉',
        confirm: '确认',
        description: '支持链式调用、数据共享、锁定状态和关闭前钩子。',
        drawerSource: '抽屉',
        drawerSourceKey: '来源',
        drawerTitle: '抽屉任务',
        lock: '锁定',
        modalSource: '弹窗',
        modalSourceKey: '来源',
        modalTitle: '编辑资料',
        openDrawer: '打开抽屉',
        openModal: '打开弹窗',
        payload: '载荷',
        title: '弹窗与抽屉'
      },
      roles: {
        description: '可对接权限系统的角色分组。',
        detail: '按职责划分的访问配置',
        roles: ['所有者', '运营员', '审计员'],
        title: '角色管理'
      },
      schemaForm: {
        defaultRole: '所有者',
        description: '以 react-hook-form 和 zod 实现 React Admin FormApi 外观。',
        email: '邮箱',
        name: '姓名',
        reset: '重置',
        role: '角色',
        submit: '提交',
        title: '配置表单'
      },
      users: {
        columns: {
          email: '邮箱',
          role: '角色',
          status: '状态',
          team: '团队'
        },
        description: '表格操作、徽标和高密度浏览状态。',
        rows: [
          { email: 'root@example.com', role: '所有者', status: '启用', team: '平台组' },
          { email: 'ops@example.com', role: '运营员', status: '启用', team: '运营组' },
          { email: 'audit@example.com', role: '审计员', status: '复核中', team: '风控组' }
        ],
        title: '用户管理'
      },
      workplace: {
        description: '面向高频后台操作的紧凑任务队列。',
        items: ['待审批', '路由缓存', '固定标签页'],
        title: '工作台'
      }
    },
    preferences: {
      actions: {
        clearCacheLogout: '清空缓存 & 退出登录',
        copy: '复制偏好设置',
        customThemeColor: '自定义主题色',
        pinNavigation: '固定偏好导航',
        reset: '重置偏好',
        resetTooltip: '重置偏好设置',
        unpinNavigation: '取消固定偏好导航'
      },
      animation: {
        pageLoading: '页面加载 Loading',
        progress: '页面加载进度条',
        title: '动画',
        transition: '页面切换动画'
      },
      appearance: {
        builtinTheme: '内置主题',
        colorWeak: '色弱模式',
        darkHeader: '深色顶栏',
        darkSidebar: '深色侧边栏',
        darkSidebarSub: '深色侧边栏子栏',
        fontSize: '字号',
        fontSizeDescription: '调整全局字体大小，实时预览效果',
        grayMode: '灰色模式',
        other: '其他',
        radius: '圆角',
        theme: '主题'
      },
      breadcrumb: {
        enable: '显示面包屑',
        hideOnlyOne: '仅一个时隐藏',
        showHome: '显示首页',
        showIcon: '显示图标',
        style: '面包屑风格',
        title: '面包屑'
      },
      copyright: {
        companyLink: '公司链接',
        companyName: '公司名称',
        date: '版权年份',
        enable: '显示版权',
        icp: 'ICP备案号',
        icpLink: 'ICP备案链接',
        title: '版权'
      },
      description: '调整主题、导航、布局和界面部件。',
      footer: {
        enable: '显示页脚',
        fixed: '固定页脚',
        title: '页脚'
      },
      general: {
        checkUpdates: '启用更新检查',
        copyPreferences: '允许复制偏好',
        dynamicTitle: '动态标题',
        language: '语言',
        timezone: '时区',
        title: '通用',
        watermark: '水印',
        watermarkContent: '水印内容'
      },
      header: {
        align: '菜单位置',
        mode: '显示模式',
        title: '顶部栏',
        visible: '显示顶部栏'
      },
      layout: {
        content: '内容',
        layout: '布局'
      },
      navigation: {
        accordion: '手风琴模式',
        split: '切割菜单',
        style: '菜单风格',
        title: '导航菜单'
      },
      shortcut: {
        closeOverlay: 'Esc 关闭弹层',
        enable: '启用快捷键',
        globalSearch: '全局搜索',
        lockScreen: '锁定屏幕',
        logout: '退出登录',
        title: '全局快捷键'
      },
      sidebar: {
        autoActivateChild: '自动激活子菜单',
        buttons: '侧栏按钮',
        collapsedButton: '折叠按钮',
        collapsedShowTitle: '折叠时显示标题',
        defaultCollapsed: '默认折叠',
        draggable: '允许拖拽宽度',
        enable: '显示侧栏',
        expandOnHover: '鼠标悬停展开',
        fixedButton: '固定按钮',
        title: '侧栏',
        width: '侧栏宽度'
      },
      tabbar: {
        draggable: '允许拖拽排序',
        enable: '显示标签页',
        maxCount: '最大标签数',
        middleClick: '中键关闭标签',
        persist: '持久化标签页',
        showIcon: '显示标签图标',
        showMaximize: '显示最大化按钮',
        showMore: '显示更多按钮',
        showRefresh: '显示刷新按钮',
        style: '标签页风格',
        title: '标签栏',
        visitHistory: '访问历史',
        wheelable: '滚轮切换标签'
      },
      title: '偏好设置',
      widgets: {
        fullscreen: '全屏按钮',
        globalSearch: '全局搜索',
        language: '语言切换',
        lockScreen: '锁屏按钮',
        notification: '通知按钮',
        preferencesButtonPosition: '偏好设置按钮位置',
        refresh: '刷新按钮',
        sidebarToggle: '侧栏折叠按钮',
        theme: '主题切换',
        timezone: '时区按钮',
        title: '界面功能'
      }
    },
    search: {
      empty: '没有找到路由。',
      group: '路由',
      placeholder: '搜索路由',
      title: '全局搜索'
    },
    tabbar: {
      close: '关闭',
      closeAll: '关闭全部',
      closeCurrent: '关闭 {title}',
      closeLeft: '关闭左侧',
      closeOther: '关闭其他',
      closeRight: '关闭右侧',
      copyPath: '复制路径',
      maximize: '最大化',
      maximizeContent: '最大化内容',
      more: '更多标签操作',
      openNewWindow: '在新窗口打开',
      pin: '固定',
      refresh: '重新加载',
      refreshCurrent: '刷新当前标签页',
      restoreContent: '还原内容',
      restoreMaximize: '还原最大化',
      unpin: '取消固定'
    },
    lock: {
      back: '返回',
      description: '设置本次会话的锁屏密码，锁定后需要输入该密码才能回到系统。',
      error: '密码错误，请重新输入。',
      password: '锁屏密码',
      placeholder: '请输入锁屏密码',
      screenTitle: '锁屏界面',
      submit: '进入系统',
      title: '锁定屏幕',
      unlock: '解锁'
    }
  }
} as const

export type AdminMessages = (typeof adminMessages)[AdminLocale]

// 函数：getAdminLocale。把外部语言标识规整为系统支持的语言。
export function getAdminLocale(locale?: string): AdminLocale {
  return locale === 'en-US' ? 'en-US' : 'zh-CN'
}

// 函数：getAdminMessages。获取当前语言对应的完整文案集合。
export function getAdminMessages(locale?: string): AdminMessages {
  return adminMessages[getAdminLocale(locale)]
}

// 函数：getLayoutOptions。生成布局模式选项及说明。
export function getLayoutOptions(locale?: string) {
  const options = getAdminMessages(locale).options.layout

  return layoutValues.map(value => ({
    label: options[value].label,
    tip: options[value].tip,
    value
  }))
}

// 函数：getColorModeOptions。生成颜色模式选项。
export function getColorModeOptions(locale?: string) {
  const options = getAdminMessages(locale).options.colorMode

  return colorModeValues.map(value => ({
    label: options[value],
    value
  }))
}

// 函数：getContentOptions。生成内容宽度模式选项。
export function getContentOptions(locale?: string) {
  const options = getAdminMessages(locale).options.content

  return contentValues.map(value => ({
    label: options[value],
    value
  }))
}

// 函数：getNavigationStyleOptions。生成导航样式选项。
export function getNavigationStyleOptions(locale?: string) {
  const options = getAdminMessages(locale).options.navigationStyle

  return navigationStyleValues.map(value => ({
    label: options[value],
    value
  }))
}

// 函数：getHeaderModeOptions。生成顶栏显示模式选项。
export function getHeaderModeOptions(locale?: string) {
  const options = getAdminMessages(locale).options.headerMode

  return headerModeValues.map(value => ({
    label: options[value],
    value
  }))
}

// 函数：getHeaderAlignOptions。生成顶栏对齐方式选项。
export function getHeaderAlignOptions(locale?: string) {
  const options = getAdminMessages(locale).options.headerAlign

  return headerAlignValues.map(value => ({
    label: options[value],
    value
  }))
}

// 函数：getTabbarStyleOptions。生成标签栏样式选项。
export function getTabbarStyleOptions(locale?: string) {
  const options = getAdminMessages(locale).options.tabbarStyle

  return tabbarStyleValues.map(value => ({
    label: options[value],
    value
  }))
}

// 函数：getLocaleOptions。生成语言切换选项。
export function getLocaleOptions(locale?: string) {
  const options = getAdminMessages(locale).options.locale

  return [
    { label: options['zh-CN'], value: 'zh-CN' },
    { label: options['en-US'], value: 'en-US' }
  ]
}

// 函数：getPreferenceButtonPositionOptions。生成偏好设置入口位置选项。
export function getPreferenceButtonPositionOptions(locale?: string) {
  const options = getAdminMessages(locale).options.preferenceButtonPosition

  return preferenceButtonPositionValues.map(value => ({
    label: options[value],
    value
  }))
}

// 函数：getPreferenceTabs。生成偏好面板的页签选项。
export function getPreferenceTabs(locale?: string) {
  const options = getAdminMessages(locale).options.preferenceTab

  return preferenceTabValues.map(value => ({
    label: options[value],
    value
  }))
}

// 函数：getThemePresetLabel。获取主题预设在当前语言下的显示名称。
export function getThemePresetLabel(type: AdminPreferences['themeBuiltinType'], locale?: string) {
  return getAdminMessages(locale).options.themePreset[type] ?? type
}

// 函数：getPreferenceStepAria。生成数值步进按钮的无障碍文本。
export function getPreferenceStepAria(
  locale: string | undefined,
  action: 'decrease' | 'increase',
  label: string
) {
  const normalizedLocale = getAdminLocale(locale)

  if (normalizedLocale === 'en-US') {
    return `${action === 'decrease' ? 'Decrease' : 'Increase'} ${label}`
  }

  return `${action === 'decrease' ? '减小' : '增大'}${label}`
}
