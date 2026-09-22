import { Activity, BriefcaseBusiness, Info, LayoutDashboard, Settings2, Shield, type LucideIcon } from 'lucide-react'

import { pageIconMap } from '@/router/routes'
import type { MenuRecord, TabRecord } from '@/types'

const menuIconMap: Record<string, LucideIcon> = {
  Activity,
  BriefcaseBusiness,
  Info,
  LayoutDashboard,
  Settings2,
  Shield
}

export function getMenuRecordIcon(item: Pick<MenuRecord, 'icon' | 'path'>): LucideIcon | undefined
export function getMenuRecordIcon(
  item: Pick<MenuRecord, 'icon' | 'path'>,
  fallback: LucideIcon
): LucideIcon
export function getMenuRecordIcon(item: Pick<MenuRecord, 'icon' | 'path'>, fallback?: LucideIcon) {
  return (item.icon ? menuIconMap[item.icon] : undefined) ?? pageIconMap[item.path] ?? fallback
}

export function getTabIcon(tab: Pick<TabRecord, 'icon' | 'path'>, fallback?: LucideIcon) {
  return tab.icon ? (pageIconMap[tab.path] ?? fallback) : undefined
}

export function hasPageIcon(path: string) {
  return Boolean(pageIconMap[path])
}

export function isMenuRecordActive(item: MenuRecord, activePath: string): boolean {
  return (
    item.path === activePath ||
    (item.children ?? []).some(child => isMenuRecordActive(child, activePath))
  )
}

export function findActiveMenuRecord(menu: MenuRecord[], activePath: string) {
  return menu.find(item => isMenuRecordActive(item, activePath))
}
