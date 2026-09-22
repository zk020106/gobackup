import type { MenuRecord } from '@/types'
import type { AuthSession } from '@/types/auth'

export type PermissionInput = string | string[] | undefined

const unrestrictedPermissions: readonly string[] = ['*']

export function resolveSessionPermissions(session: AuthSession | undefined) {
  if (!session) {
    return undefined
  }

  if (session.user.permissions.includes('*') || session.user.roles.includes('owner')) {
    return unrestrictedPermissions
  }

  return session.user.permissions
}

// 基于 Set 的权限判定：调用方已持有权限集合时复用，避免对权限数组重复线性扫描。
function hasPermissionInSet(permissionSet: ReadonlySet<string>, permission: PermissionInput) {
  if (!permission || (Array.isArray(permission) && permission.length === 0)) {
    return true
  }

  if (permissionSet.has('*')) {
    return true
  }

  const requiredPermissions = Array.isArray(permission) ? permission : [permission]

  return requiredPermissions.some(item => permissionSet.has(item))
}

export function hasPermission(userPermissions: readonly string[], permission: PermissionInput) {
  // 短路廉价分支，无需为空权限或无要求的检查构建 Set。
  if (!permission || (Array.isArray(permission) && permission.length === 0)) {
    return true
  }

  return hasPermissionInSet(new Set(userPermissions), permission)
}

export function filterAuthorizedMenu(
  menu: readonly MenuRecord[],
  userPermissions: readonly string[]
): MenuRecord[] {
  // 整棵菜单树只构建一次权限集合，递归各节点共用，每次判定降到 O(1)。
  return filterAuthorizedMenuWithSet(menu, new Set(userPermissions))
}

function filterAuthorizedMenuWithSet(
  menu: readonly MenuRecord[],
  permissionSet: ReadonlySet<string>
): MenuRecord[] {
  return menu.flatMap(item => {
    const children = filterAuthorizedMenuWithSet(item.children ?? [], permissionSet)
    const selfAllowed = hasPermissionInSet(permissionSet, item.permission)

    if (!selfAllowed && children.length === 0) {
      return []
    }

    return [
      {
        ...item,
        ...(children.length > 0 ? { children } : { children: undefined })
      }
    ]
  })
}
