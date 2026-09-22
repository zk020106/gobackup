import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import { preferenceStore } from '@/store/preferences'
import type { AdminPreferences } from '@/types'

/** 订阅单个偏好字段；依赖 zustand 默认的 Object.is 比较，无关字段变化不会触发重渲染。 */
export function usePreference<T>(selector: (preferences: AdminPreferences) => T): T {
  return useStore(preferenceStore, state => selector(state.preferences))
}

/** 订阅多个偏好字段：用 useShallow 浅比较，避免每次返回新对象引用导致的无谓重渲染。
 *  仅当所选字段中有任意一个实际变化时才会触发重渲染。 */
export function usePreferencesSlice<T extends Record<string, unknown>>(
  selector: (preferences: AdminPreferences) => T
): T {
  return useStore(
    preferenceStore,
    useShallow(state => selector(state.preferences))
  )
}

/** 读取偏好写入方法；setPreferences 在 store 创建后引用恒定，订阅它不会引发重渲染。 */
export function useSetPreferences() {
  return useStore(preferenceStore, state => state.setPreferences)
}
