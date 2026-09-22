import { describe, expect, it } from 'vitest'

import {
  getPreferenceDiff,
  preferenceRadiusOptions,
  preferenceTimezoneOptions,
  preferenceTransitionOptions,
  resolvePreferencesButtonPlacement
} from '@/layouts/preferences-options'
import { DEFAULT_PREFERENCES } from '@/store/preferences'

describe('preference layout options', () => {
  it('exposes stable built-in preference options', () => {
    expect(preferenceRadiusOptions).toEqual(['0', '0.25', '0.5', '0.75', '1'])
    expect(preferenceTimezoneOptions.map(item => item.value)).toEqual([
      'Asia/Shanghai',
      'UTC',
      'America/New_York',
      'Europe/London'
    ])
    expect(preferenceTransitionOptions.map(item => item.value)).toEqual([
      'fade',
      'fade-slide',
      'fade-up',
      'fade-down'
    ])
  })

  it('respects explicit preference button placement', () => {
    expect(
      resolvePreferencesButtonPlacement({
        headerEnabled: true,
        isMobile: false,
        preferences: {
          ...DEFAULT_PREFERENCES,
          appPreferencesButtonPosition: 'user-dropdown'
        },
        sidebarEnabled: true
      })
    ).toEqual({
      fixed: false,
      header: false,
      userDropdown: true
    })
  })

  it('uses header placement for regular desktop auto mode', () => {
    expect(
      resolvePreferencesButtonPlacement({
        headerEnabled: true,
        isMobile: false,
        preferences: DEFAULT_PREFERENCES,
        sidebarEnabled: true
      })
    ).toEqual({
      fixed: false,
      header: true,
      userDropdown: false
    })
  })

  it('uses fixed placement when auto mode has no stable header entry', () => {
    expect(
      resolvePreferencesButtonPlacement({
        headerEnabled: false,
        isMobile: false,
        preferences: DEFAULT_PREFERENCES,
        sidebarEnabled: true
      })
    ).toEqual({
      fixed: true,
      header: false,
      userDropdown: false
    })

    expect(
      resolvePreferencesButtonPlacement({
        headerEnabled: true,
        isMobile: true,
        preferences: DEFAULT_PREFERENCES,
        sidebarEnabled: true
      })
    ).toEqual({
      fixed: true,
      header: false,
      userDropdown: false
    })
  })

  it('returns only preferences that differ from defaults', () => {
    expect(
      getPreferenceDiff({
        ...DEFAULT_PREFERENCES,
        colorMode: 'light',
        sidebarCollapsed: true,
        sidebarWidth: 260
      })
    ).toEqual({
      colorMode: 'light',
      sidebarCollapsed: true,
      sidebarWidth: 260
    })
  })
})
