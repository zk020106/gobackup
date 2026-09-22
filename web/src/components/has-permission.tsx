import type { ReactNode } from 'react'
import { useStore } from 'zustand'

import { runtimeEnv } from '@/config/env'
import { hasPermission, resolveSessionPermissions, type PermissionInput } from '@/lib/permissions'
import { authStore } from '@/store/auth'

const unrestrictedPermissions: readonly string[] = ['*']
const anonymousPermissions: readonly string[] = []

/** 读取当前会话权限；免登录模式且无会话时按全量权限处理。 */
export function usePermissions() {
  const session = useStore(authStore, state => state.session)
  const sessionPermissions = resolveSessionPermissions(session)

  return (
    sessionPermissions ?? (runtimeEnv.authRequired ? anonymousPermissions : unrestrictedPermissions)
  )
}

/** 按权限编码控制子内容渲染，未授权时渲染 fallback。 */
export function HasPermission({
  children,
  fallback = null,
  permission
}: {
  children: ReactNode
  fallback?: ReactNode
  permission: PermissionInput
}) {
  const permissions = usePermissions()

  return <>{hasPermission(permissions, permission) ? children : fallback}</>
}
