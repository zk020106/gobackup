import { adminPages } from '@/router/routes'
import type { MenuRecord, TabRecord } from '@/types'

export const ADMIN_DEFAULT_PATH = '/overview'

// 菜单直接由前端路由定义生成，顺序即侧边栏顺序，不再依赖 mock 数据。
export const adminMenu: MenuRecord[] = adminPages.map(page => ({
  icon: page.iconName,
  key: page.path,
  path: page.path,
  permission: page.permission,
  title: page.title
}))

export const affixTabs: TabRecord[] = [
  {
    affix: true,
    icon: 'LayoutDashboard',
    key: ADMIN_DEFAULT_PATH,
    path: ADMIN_DEFAULT_PATH,
    title: '概览'
  }
]

export const adminRoutePaths: string[] = []

// 函数：flattenMenuRecords。展开管理菜单树，供路由和标签计算复用。
export function flattenMenuRecords(menu: MenuRecord[]): MenuRecord[] {
  return menu.flatMap(item => [item, ...flattenMenuRecords(item.children ?? [])])
}

// 菜单数组到路径索引的缓存：菜单引用稳定（来自模块常量或 query 缓存），
// 用 WeakMap 让每棵菜单树只扁平化一次，路径查找降为 O(1)。
const menuIndexCache = new WeakMap<MenuRecord[], Map<string, MenuRecord>>()

// 函数：getMenuIndex。获取（或构建）菜单树的路径索引。
function getMenuIndex(menu: MenuRecord[]) {
  let index = menuIndexCache.get(menu)

  if (!index) {
    index = new Map(flattenMenuRecords(menu).map(item => [item.path, item]))
    menuIndexCache.set(menu, index)
  }

  return index
}

// 函数：normalizePathname。去除查询、哈希和尾部斜杠，得到稳定路径。
function normalizePathname(pathname: string) {
  const [path = ''] = pathname.split(/[?#]/)
  const normalized = path.startsWith('/') ? path : `/${path}`

  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

// 函数：getDefaultMenuPath。获取菜单节点可进入的默认叶子路径。
export function getDefaultMenuPath(item: MenuRecord): string {
  return item.children?.[0] ? getDefaultMenuPath(item.children[0]) : item.path
}

// 函数：normalizeAdminPath。把任意路径规整到 mock 菜单可访问页面。
export function normalizeAdminPath(pathname: string, menu: MenuRecord[] = adminMenu) {
  const path = normalizePathname(pathname)

  if (path === '/') {
    return ADMIN_DEFAULT_PATH
  }

  const menuRecord = getMenuIndex(menu).get(path)

  return menuRecord ? getDefaultMenuPath(menuRecord) : ADMIN_DEFAULT_PATH
}

// 函数：getMenuTitle。获取 mock 菜单中路径对应的标题。
export function getMenuTitle(path: string, menu: MenuRecord[] = adminMenu) {
  const index = getMenuIndex(menu)

  return index.get(path)?.title ?? index.get(ADMIN_DEFAULT_PATH)?.title ?? path
}

// 函数：findMenuRecordByPath。按路径查找菜单记录，未命中返回 undefined。
export function findMenuRecordByPath(path: string, menu: MenuRecord[] = adminMenu) {
  return getMenuIndex(menu).get(path)
}
