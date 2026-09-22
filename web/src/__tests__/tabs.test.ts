import { afterEach, describe, expect, it, vi } from 'vitest'

import { getVisibleTabs } from '@/layouts/tabbar'
import { getWorkspaceRootMenu, resolveWorkspaceTab } from '@/layouts/workspace-navigation'
import { createTabsStore } from '@/store/tabs'

const menu = [
  {
    icon: 'LayoutDashboard',
    key: '/overview',
    path: '/overview',
    title: 'Overview'
  },
  {
    icon: 'Info',
    key: '/about',
    path: '/about',
    title: 'About'
  },
  {
    children: [
      { key: '/custom/page', path: '/custom/page', title: 'Page' }
    ],
    icon: 'Shield',
    key: '/custom',
    path: '/custom',
    title: 'Custom'
  }
]

describe('tabs store', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('adds unique tabs and falls back to the nearest tab when closing the active tab', () => {
    const store = createTabsStore([
      { affix: true, key: '/dashboard', path: '/dashboard', title: 'Dashboard' }
    ])

    store.getState().openTab({ key: '/system/users', path: '/system/users', title: 'Users' })
    store.getState().openTab({ key: '/system/roles', path: '/system/roles', title: 'Roles' })
    store.getState().openTab({ key: '/system/users', path: '/system/users', title: 'Users' })

    expect(store.getState().tabs.map(tab => tab.key)).toEqual([
      '/dashboard',
      '/system/users',
      '/system/roles'
    ])
    expect(store.getState().activeKey).toBe('/system/users')

    store.getState().closeTab('/system/users')

    expect(store.getState().activeKey).toBe('/system/roles')
    expect(store.getState().tabs.map(tab => tab.key)).toEqual(['/dashboard', '/system/roles'])
  })

  it('keeps affix tabs when closing others and can reorder non-affix tabs', () => {
    const store = createTabsStore([
      { affix: true, key: '/dashboard', path: '/dashboard', title: 'Dashboard' },
      { key: '/system/users', path: '/system/users', title: 'Users' },
      { key: '/system/roles', path: '/system/roles', title: 'Roles' }
    ])

    store.getState().closeOthers('/system/roles')

    expect(store.getState().tabs.map(tab => tab.key)).toEqual(['/dashboard', '/system/roles'])

    store.getState().openTab({ key: '/workplace', path: '/workplace', title: 'Workplace' })
    store.getState().reorderTabs(2, 1)

    expect(store.getState().tabs.map(tab => tab.key)).toEqual([
      '/dashboard',
      '/workplace',
      '/system/roles'
    ])
  })

  it('closes tabs on the left and right while preserving affix tabs', () => {
    const store = createTabsStore([
      { affix: true, key: '/dashboard', path: '/dashboard', title: 'Dashboard' },
      { key: '/workplace', path: '/workplace', title: 'Workplace' },
      { key: '/system/users', path: '/system/users', title: 'Users' },
      { key: '/system/roles', path: '/system/roles', title: 'Roles' }
    ])

    store.getState().setActiveKey('/workplace')
    store.getState().closeLeft('/system/users')

    expect(store.getState().tabs.map(tab => tab.key)).toEqual([
      '/dashboard',
      '/system/users',
      '/system/roles'
    ])
    expect(store.getState().activeKey).toBe('/system/users')

    store.getState().closeRight('/system/users')

    expect(store.getState().tabs.map(tab => tab.key)).toEqual(['/dashboard', '/system/users'])
  })

  it('toggles tab affix state', () => {
    const store = createTabsStore([
      { affix: true, key: '/dashboard', path: '/dashboard', title: 'Dashboard' },
      { key: '/workplace', path: '/workplace', title: 'Workplace' }
    ])

    store.getState().toggleAffix('/workplace')

    expect(store.getState().tabs.find(tab => tab.key === '/workplace')?.affix).toBe(true)

    store.getState().toggleAffix('/workplace')

    expect(store.getState().tabs.find(tab => tab.key === '/workplace')?.affix).toBe(false)
  })

  it('keeps one tab when closing all without affix tabs', () => {
    const store = createTabsStore([
      { key: '/workplace', path: '/workplace', title: 'Workplace' },
      { key: '/system/users', path: '/system/users', title: 'Users' }
    ])

    store.getState().closeAll()

    expect(store.getState().tabs.map(tab => tab.key)).toEqual(['/workplace'])
    expect(store.getState().activeKey).toBe('/workplace')
  })

  it('keeps store actions connected after resetting tab state', () => {
    const store = createTabsStore([
      { affix: true, key: '/dashboard', path: '/dashboard', title: 'Dashboard' }
    ])

    store.setState({
      activeKey: '/dashboard',
      tabs: [{ affix: true, key: '/dashboard', path: '/dashboard', title: 'Dashboard' }]
    })
    store.getState().openTab({ key: '/workplace', path: '/workplace', title: 'Workplace' })

    expect(store.getState().tabs.map(tab => tab.key)).toEqual(['/dashboard', '/workplace'])
    expect(store.getState().activeKey).toBe('/workplace')
  })

  it('persists and restores tabs when persistence is enabled', async () => {
    const storageKey = 'test-tabs:v1'
    const store = createTabsStore(
      [{ affix: true, key: '/overview', path: '/overview', title: 'Overview' }],
      { persist: true, storageKey }
    )

    store.getState().openTab({ key: '/workplace', path: '/workplace', title: 'Workplace' })
    store.getState().openTab({ key: '/system/users', path: '/system/users', title: 'Users' })

    // 本地写入做了防抖，等待落盘后再断言和恢复。
    await vi.waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')).toEqual({
        activeKey: '/system/users',
        tabs: [
          { affix: true, key: '/overview', path: '/overview', title: 'Overview' },
          { key: '/workplace', path: '/workplace', title: 'Workplace' },
          { key: '/system/users', path: '/system/users', title: 'Users' }
        ],
        version: 1
      })
    })

    const restoredStore = createTabsStore([], { persist: true, storageKey })

    expect(restoredStore.getState().activeKey).toBe('/system/users')
    expect(restoredStore.getState().tabs.map(tab => tab.key)).toEqual([
      '/overview',
      '/workplace',
      '/system/users'
    ])
  })

  it('skips restored tabs and clears storage when persistence is disabled', () => {
    const storageKey = 'test-tabs-disabled:v1'
    let enabled = false

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeKey: '/system/users',
        tabs: [{ key: '/system/users', path: '/system/users', title: 'Users' }],
        version: 1
      })
    )

    const store = createTabsStore(
      [{ affix: true, key: '/overview', path: '/overview', title: 'Overview' }],
      {
        persist: true,
        shouldPersist: () => enabled,
        storageKey
      }
    )

    expect(store.getState().tabs.map(tab => tab.key)).toEqual(['/overview'])

    store.getState().openTab({ key: '/workplace', path: '/workplace', title: 'Workplace' })
    expect(window.localStorage.getItem(storageKey)).toBeNull()

    enabled = true
    store.getState().persistTabs()
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')).toEqual({
      activeKey: '/workplace',
      tabs: [
        { affix: true, key: '/overview', path: '/overview', title: 'Overview' },
        { key: '/workplace', path: '/workplace', title: 'Workplace' }
      ],
      version: 1
    })
  })

  it('keeps the active tab visible when trimming tabbar items', () => {
    const tabs = [
      { affix: true, key: '/dashboard', path: '/dashboard', title: 'Dashboard' },
      { key: '/workplace', path: '/workplace', title: 'Workplace' },
      { key: '/system/users', path: '/system/users', title: 'Users' },
      { key: '/system/roles', path: '/system/roles', title: 'Roles' }
    ]

    expect(getVisibleTabs(tabs, '/workplace', 2).map(tab => tab.key)).toEqual([
      '/system/roles',
      '/workplace'
    ])
    expect(getVisibleTabs(tabs, '/system/roles', 2).map(tab => tab.key)).toEqual([
      '/system/users',
      '/system/roles'
    ])
    expect(getVisibleTabs(tabs, '/missing', 2).map(tab => tab.key)).toEqual([
      '/system/users',
      '/system/roles'
    ])
  })
})

describe('workspace navigation helpers', () => {
  it('resolves workspace tabs with affix and page icon metadata', () => {
    expect(resolveWorkspaceTab('/overview', menu)).toEqual({
      affix: true,
      icon: '/overview',
      key: '/overview',
      path: '/overview',
      title: 'Overview'
    })

    expect(resolveWorkspaceTab('/about', menu)).toEqual({
      affix: false,
      icon: '/about',
      key: '/about',
      path: '/about',
      title: 'About'
    })

    expect(resolveWorkspaceTab('/custom/page', menu)).toEqual({
      affix: false,
      icon: undefined,
      key: '/custom/page',
      path: '/custom/page',
      title: 'Page'
    })
  })

  it('resolves the root menu for nested paths and falls back safely', () => {
    expect(getWorkspaceRootMenu('/custom/page', menu)?.path).toBe('/custom')
    expect(getWorkspaceRootMenu('/overview', menu)?.path).toBe('/overview')
    expect(getWorkspaceRootMenu('/missing', menu)?.path).toBe('/overview')
  })
})
