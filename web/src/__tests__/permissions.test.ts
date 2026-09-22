import { describe, expect, it } from 'vitest'

import { filterAuthorizedMenu, hasPermission } from '@/lib/permissions'
import type { MenuRecord } from '@/types'

const menu: MenuRecord[] = [
  {
    key: '/overview',
    path: '/overview',
    permission: 'overview:read',
    title: '概览'
  },
  {
    children: [
      {
        key: '/system/users',
        path: '/system/users',
        permission: 'system:user:read',
        title: '用户管理'
      },
      {
        key: '/system/roles',
        path: '/system/roles',
        permission: 'system:role:read',
        title: '角色管理'
      }
    ],
    key: '/system',
    path: '/system',
    permission: 'system:read',
    title: '系统管理'
  },
  {
    key: '/about',
    path: '/about',
    title: '关于'
  }
]

describe('permission helpers', () => {
  it('keeps open routes and authorized child routes', () => {
    const filtered = filterAuthorizedMenu(menu, ['system:user:read'])

    expect(filtered.map(item => item.path)).toEqual(['/system', '/about'])
    expect(filtered[0]?.children?.map(item => item.path)).toEqual(['/system/users'])
  })

  it('supports wildcard and multi-permission checks', () => {
    expect(hasPermission(['*'], 'system:role:read')).toBe(true)
    expect(hasPermission(['system:user:read'], ['system:user:read', 'system:role:read'])).toBe(true)
    expect(hasPermission(['system:user:read'], 'system:role:read')).toBe(false)
    expect(hasPermission([], undefined)).toBe(true)
  })
})
