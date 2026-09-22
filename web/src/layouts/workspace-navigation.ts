import { ADMIN_DEFAULT_PATH, getMenuTitle } from '@/router/app-data'
import type { MenuRecord, TabRecord } from '@/types'
import { findMenuTrail } from '@/utils/menu'

import { hasPageIcon } from '@/layouts/navigation'

/**
 * 把路由路径转换成标签页记录。
 *
 * @param path - 需要转换的路由路径。
 * @param menu - 当前可用的菜单树。
 * @returns 标签页记录。
 */
export function resolveWorkspaceTab(path: string, menu: MenuRecord[]): TabRecord {
  const title = getMenuTitle(path, menu)

  return {
    affix: path === ADMIN_DEFAULT_PATH,
    icon: hasPageIcon(path) ? path : undefined,
    key: path,
    path,
    title
  }
}

/**
 * 获取当前路径所在的一级菜单。
 *
 * @param path - 当前路由路径。
 * @param menu - 当前可用的菜单树。
 * @returns 命中的一级菜单；若未命中则回退到同路径菜单或首个菜单。
 */
export function getWorkspaceRootMenu(path: string, menu: MenuRecord[]) {
  return (
    findMenuTrail(menu, path)?.[0] ??
    menu.find(item => item.path === path) ??
    menu[0] ?? {
      key: ADMIN_DEFAULT_PATH,
      path: ADMIN_DEFAULT_PATH,
      title: getMenuTitle(ADMIN_DEFAULT_PATH, menu)
    }
  )
}
