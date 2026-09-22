import { createStore } from 'zustand/vanilla'

import { preferenceStore } from '@/store/preferences'
import type { TabRecord } from '@/types'

export interface TabsStoreState {
  activeKey?: string
  // 方法：clearPersistedTabs。清除本地持久化的标签页缓存。
  clearPersistedTabs: () => void
  // 方法：closeAll。关闭所有可关闭标签并保留固定标签。
  closeAll: () => void
  // 方法：closeLeft。关闭指定标签左侧的可关闭标签。
  closeLeft: (key: string) => void
  // 方法：closeOthers。关闭指定标签之外的可关闭标签。
  closeOthers: (key: string) => void
  // 方法：closeRight。关闭指定标签右侧的可关闭标签。
  closeRight: (key: string) => void
  // 方法：closeTab。关闭单个非固定标签。
  closeTab: (key: string) => void
  // 方法：openTab。打开或刷新一个标签页。
  openTab: (tab: TabRecord) => void
  // 方法：persistTabs。立即把当前标签页状态写入本地缓存。
  persistTabs: () => void
  // 方法：reorderTabs。按拖拽位置重排标签页。
  reorderTabs: (fromIndex: number, toIndex: number) => void
  // 方法：setActiveKey。切换当前激活标签。
  setActiveKey: (key: string) => void
  tabs: TabRecord[]
  // 方法：toggleAffix。切换标签的固定状态。
  toggleAffix: (key: string) => void
}

interface TabsStoreOptions {
  persist?: boolean
  shouldPersist?: () => boolean
  storageKey?: string
}

interface StoredTabsPayload {
  activeKey?: string
  tabs?: unknown
  version?: number
}

export const TABS_STORAGE_KEY = 'gobackup:tabs:v1'
const TABS_STORAGE_VERSION = 1
const TABS_PERSIST_DEBOUNCE_MS = 150

// 函数：getLocalStorage。安全获取浏览器 localStorage。
function getLocalStorage() {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

// 函数：uniqueTabs。移除重复标签并保留首次出现的顺序。
function uniqueTabs(tabs: TabRecord[]) {
  // 恢复数据存在重复标签时保留第一项，保证顺序稳定。
  return tabs.filter(
    (tab, index, source) => source.findIndex(item => item.key === tab.key) === index
  )
}

// 函数：nextActiveAfterClose。计算关闭标签后的下一个激活标签。
function nextActiveAfterClose(tabs: TabRecord[], closedIndex: number) {
  // 关闭标签后优先激活右侧标签，再回退到左侧，贴近浏览器行为。
  return tabs[closedIndex]?.key ?? tabs[closedIndex - 1]?.key ?? tabs[0]?.key
}

// 函数：normalizeStoredTab。校正本地恢复出的单个标签页。
function normalizeStoredTab(tab: unknown): TabRecord | undefined {
  if (!tab || typeof tab !== 'object') {
    return undefined
  }

  const record = tab as Partial<TabRecord>

  if (
    typeof record.key !== 'string' ||
    typeof record.path !== 'string' ||
    typeof record.title !== 'string'
  ) {
    return undefined
  }

  return {
    ...(typeof record.badge === 'string' ? { badge: record.badge } : {}),
    ...(typeof record.icon === 'string' ? { icon: record.icon } : {}),
    affix: record.affix === true,
    key: record.key,
    path: record.path,
    title: record.title
  }
}

// 函数：readStoredTabs。读取并校验本地持久化的标签页。
function readStoredTabs(storageKey: string) {
  const storage = getLocalStorage()

  if (!storage) {
    return undefined
  }

  try {
    const raw = storage.getItem(storageKey)

    if (!raw) {
      return undefined
    }

    const parsed = JSON.parse(raw) as StoredTabsPayload

    if (parsed.version !== TABS_STORAGE_VERSION || !Array.isArray(parsed.tabs)) {
      storage.removeItem(storageKey)
      return undefined
    }

    const tabs = uniqueTabs(parsed.tabs.flatMap(tab => normalizeStoredTab(tab) ?? []))
    const activeKey =
      typeof parsed.activeKey === 'string' && tabs.some(tab => tab.key === parsed.activeKey)
        ? parsed.activeKey
        : tabs[0]?.key

    return tabs.length > 0 ? { activeKey, tabs } : undefined
  } catch {
    storage.removeItem(storageKey)
  }

  return undefined
}

// 函数：writeStoredTabs。把当前标签页状态写入本地存储。
function writeStoredTabs(storageKey: string, state: Pick<TabsStoreState, 'activeKey' | 'tabs'>) {
  const storage = getLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(
      storageKey,
      JSON.stringify({
        activeKey: state.activeKey,
        tabs: state.tabs.map(tab => ({
          ...(tab.affix ? { affix: true } : {}),
          ...(tab.badge ? { badge: tab.badge } : {}),
          ...(tab.icon ? { icon: tab.icon } : {}),
          key: tab.key,
          path: tab.path,
          title: tab.title
        })),
        version: TABS_STORAGE_VERSION
      })
    )
  } catch {
    // 忽略存储配额或隐私模式失败，内存状态仍可继续工作。
  }
}

// 函数：removeStoredTabs。清除本地存储中的标签页状态。
function removeStoredTabs(storageKey: string) {
  const storage = getLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(storageKey)
  } catch {
    // 忽略禁用存储导致的清理失败。
  }
}

// 函数：createTabsStore。创建标签页状态仓库并注入初始标签。
export function createTabsStore(initialTabs: TabRecord[] = [], options: TabsStoreOptions = {}) {
  const storageKey = options.storageKey ?? TABS_STORAGE_KEY
  const shouldPersist = () => Boolean(options.persist && (options.shouldPersist?.() ?? true))
  const persisted = shouldPersist() ? readStoredTabs(storageKey) : undefined
  const normalized = uniqueTabs(persisted?.tabs ?? initialTabs)
  const initialActiveKey = normalized.some(tab => tab.key === persisted?.activeKey)
    ? persisted?.activeKey
    : normalized[0]?.key

  const store = createStore<TabsStoreState>()((set, get) => ({
    activeKey: initialActiveKey,
    clearPersistedTabs: () => removeStoredTabs(storageKey),
    closeAll: () => {
      const affixTabs = get().tabs.filter(tab => tab.affix)
      // 至少保留一个标签，确保外壳始终有确定的激活路由。
      const tabs = affixTabs.length > 0 ? affixTabs : get().tabs.slice(0, 1)
      set({
        activeKey: tabs[0]?.key,
        tabs
      })
    },
    closeLeft: key => {
      const current = get()
      const targetIndex = current.tabs.findIndex(tab => tab.key === key)

      if (targetIndex <= 0) {
        return
      }

      const tabs = current.tabs.filter((tab, index) => tab.affix || index >= targetIndex)

      set({
        activeKey: tabs.some(tab => tab.key === current.activeKey) ? current.activeKey : key,
        tabs
      })
    },
    closeOthers: key => {
      const tabs = get().tabs.filter(tab => tab.affix || tab.key === key)
      set({
        activeKey: tabs.some(tab => tab.key === key) ? key : tabs[0]?.key,
        tabs
      })
    },
    closeRight: key => {
      const current = get()
      const targetIndex = current.tabs.findIndex(tab => tab.key === key)

      if (targetIndex < 0 || targetIndex >= current.tabs.length - 1) {
        return
      }

      const tabs = current.tabs.filter((tab, index) => tab.affix || index <= targetIndex)

      set({
        activeKey: tabs.some(tab => tab.key === current.activeKey) ? current.activeKey : key,
        tabs
      })
    },
    closeTab: key => {
      const current = get()
      const target = current.tabs.find(tab => tab.key === key)

      if (!target || target.affix) {
        return
      }

      const closedIndex = current.tabs.findIndex(tab => tab.key === key)
      const tabs = current.tabs.filter(tab => tab.key !== key)

      set({
        activeKey:
          current.activeKey === key ? nextActiveAfterClose(tabs, closedIndex) : current.activeKey,
        tabs
      })
    },
    openTab: tab => {
      const current = get()
      const exists = current.tabs.some(item => item.key === tab.key)

      set({
        activeKey: tab.key,
        tabs: exists
          ? current.tabs.map(item =>
              item.key === tab.key ? { ...item, ...tab, affix: item.affix || tab.affix } : item
            )
          : [...current.tabs, tab]
      })
    },
    persistTabs: () => {
      if (shouldPersist()) {
        writeStoredTabs(storageKey, get())
      }
    },
    reorderTabs: (fromIndex, toIndex) => {
      const tabs = [...get().tabs]

      // 固定标签是锚点，不允许其他标签移动到其位置破坏约束。
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= tabs.length ||
        toIndex >= tabs.length ||
        tabs[toIndex]?.affix
      ) {
        return
      }

      const [moving] = tabs.splice(fromIndex, 1)
      if (!moving) {
        return
      }
      tabs.splice(toIndex, 0, moving)
      set({ tabs })
    },
    setActiveKey: key => set({ activeKey: key }),
    tabs: normalized,
    toggleAffix: key => {
      set({
        tabs: get().tabs.map(tab => (tab.key === key ? { ...tab, affix: !tab.affix } : tab))
      })
    }
  }))

  if (options.persist) {
    let writeTimer: ReturnType<typeof setTimeout> | undefined

    // 标签页在路由切换时高频更新，本地写入做短防抖，避免每次 set 都同步序列化。
    store.subscribe(() => {
      clearTimeout(writeTimer)

      if (!shouldPersist()) {
        removeStoredTabs(storageKey)
        return
      }

      writeTimer = setTimeout(() => {
        // 延迟期间持久化开关可能已关闭，写入前需复查。
        if (shouldPersist()) {
          writeStoredTabs(storageKey, store.getState())
        }
      }, TABS_PERSIST_DEBOUNCE_MS)
    })
  }

  return store
}

export const tabsStore = createTabsStore(
  [{ affix: true, key: '/overview', path: '/overview', title: '概览' }],
  {
    persist: true,
    shouldPersist: () => preferenceStore.getState().preferences.tabbarPersist
  }
)
