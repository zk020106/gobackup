import { afterEach, describe, expect, it } from 'vitest'

import { createPreferenceStore, DEFAULT_PREFERENCES } from '@/store/preferences'

describe('admin preferences', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('starts with admin defaults and clamps numeric layout values', () => {
    const store = createPreferenceStore({
      contentPadding: -20,
      layout: 'header-nav',
      sidebarWidth: 640,
      tabbarMaxCount: -10,
      themeFontSize: 100
    })

    expect(store.getState().preferences).toEqual(
      expect.objectContaining({
        ...DEFAULT_PREFERENCES,
        contentPadding: 0,
        layout: 'header-nav',
        sidebarWidth: 320,
        tabbarMaxCount: 0,
        themeFontSize: 22
      })
    )
  })

  it('updates and resets preferences through a zustand store', () => {
    const store = createPreferenceStore()

    store.getState().setPreferences({
      colorMode: 'dark',
      sidebarCollapsed: true,
      tabbarEnable: false
    })

    expect(store.getState().preferences).toEqual(
      expect.objectContaining({
        colorMode: 'dark',
        sidebarCollapsed: true,
        tabbarEnable: false
      })
    )

    store.getState().resetPreferences()

    expect(store.getState().preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it('persists preferences to localStorage when enabled', () => {
    window.localStorage.setItem(
      'test-preferences',
      JSON.stringify({
        preferences: {
          colorMode: 'light',
          sidebarWidth: 999,
          themeBuiltinType: 'green'
        }
      })
    )

    const store = createPreferenceStore(undefined, {
      persist: true,
      storageKey: 'test-preferences'
    })

    expect(store.getState().preferences).toEqual(
      expect.objectContaining({
        colorMode: 'light',
        sidebarWidth: 320,
        themeBuiltinType: 'green'
      })
    )

    store.getState().setPreferences({ colorMode: 'dark', themeRadius: '1' })

    // 只持久化与默认值的差异：colorMode 改回默认后不再写入存储。
    expect(JSON.parse(window.localStorage.getItem('test-preferences') ?? '{}')).toEqual({
      preferences: {
        sidebarWidth: 320,
        themeBuiltinType: 'green',
        themeRadius: '1'
      },
      version: 1
    })

    const restoredStore = createPreferenceStore(undefined, {
      persist: true,
      storageKey: 'test-preferences'
    })

    expect(restoredStore.getState().preferences).toEqual(
      expect.objectContaining({
        colorMode: 'dark',
        sidebarWidth: 320,
        themeBuiltinType: 'green',
        themeRadius: '1'
      })
    )

    store.getState().resetPreferences()

    expect(JSON.parse(window.localStorage.getItem('test-preferences') ?? '{}')).toEqual({
      preferences: {},
      version: 1
    })
  })
})
