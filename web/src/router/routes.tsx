import {
  Activity,
  Archive,
  FileText,
  Info,
  LayoutDashboard,
  ListChecks,
  Settings2,
  type LucideIcon
} from 'lucide-react'
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface AdminPageDefinition {
  component: LazyExoticComponent<ComponentType>
  icon: LucideIcon
  /** 菜单图标名，与 layouts/navigation.ts 的 icon map 对应。 */
  iconName?: string
  path: string
  permission?: string
  title: string
}

const OverviewPage = lazy(() => import('@/pages/overview-page'))
const TasksPage = lazy(() => import('@/pages/tasks-page'))
const EnvironmentPage = lazy(() => import('@/pages/environment-page'))
const LogsPage = lazy(() => import('@/pages/logs-page'))
const AboutPage = lazy(() => import('@/pages/about-page'))
const ConfigEditorPage = lazy(() => import('@/pages/config-editor-page'))

export const adminPages: AdminPageDefinition[] = [
  {
    component: OverviewPage,
    icon: LayoutDashboard,
    iconName: 'LayoutDashboard',
    path: '/overview',
    permission: 'overview:read',
    title: '备份概览'
  },
  {
    component: TasksPage,
    icon: ListChecks,
    iconName: 'ListChecks',
    path: '/tasks',
    permission: 'tasks:read',
    title: '任务中心'
  },
  {
    component: EnvironmentPage,
    icon: Activity,
    iconName: 'Activity',
    path: '/environment',
    permission: 'environment:read',
    title: '环境检测'
  },
  {
    component: ConfigEditorPage,
    icon: Settings2,
    iconName: 'Settings2',
    path: '/settings/config',
    permission: 'config:read',
    title: '配置管理'
  },
  {
    component: LogsPage,
    icon: FileText,
    iconName: 'FileText',
    path: '/logs',
    permission: 'logs:read',
    title: '运行日志'
  },
  {
    component: AboutPage,
    icon: Info,
    iconName: 'Info',
    path: '/about',
    permission: 'about:read',
    title: '关于 GoBackup'
  }
]

export const pageIconMap: Record<string, LucideIcon> = Object.fromEntries(
  adminPages.map(page => [page.path, page.icon])
)

export function getAdminPageDefinition(path: string): AdminPageDefinition {
  const page = adminPages.find(item => item.path === path)

  if (!page) {
    throw new Error(`Unknown admin page definition: ${path}`)
  }

  return page
}

export const browserPageIcon = Archive
