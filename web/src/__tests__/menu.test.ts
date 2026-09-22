import { describe, expect, it } from 'vitest'

import { buildWorkspaceSearchItems, findMenuTrail, flattenMenu, searchMenu } from '@/utils/menu'

const menu = [
  {
    icon: 'LayoutDashboard',
    key: '/dashboard',
    path: '/dashboard',
    title: 'Dashboard'
  },
  {
    children: [
      { key: '/system/users', path: '/system/users', title: 'Users' },
      { badge: '4', key: '/system/roles', path: '/system/roles', title: 'Roles' }
    ],
    icon: 'Shield',
    key: '/system',
    path: '/system',
    title: 'System'
  }
]

describe('menu helpers', () => {
  it('flattens nested menu records and resolves breadcrumb trails', () => {
    expect(flattenMenu(menu).map(item => item.key)).toEqual([
      '/dashboard',
      '/system',
      '/system/users',
      '/system/roles'
    ])

    expect(findMenuTrail(menu, '/system/users')?.map(item => item.title)).toEqual([
      'System',
      'Users'
    ])
  })

  it('searches by title, path and badge text', () => {
    expect(searchMenu(menu, 'role').map(item => item.path)).toEqual(['/system/roles'])
    expect(searchMenu(menu, '4').map(item => item.path)).toEqual(['/system/roles'])
  })

  it('builds workspace search candidates from the menu tree', () => {
    const items = buildWorkspaceSearchItems(menu)

    expect(items.map(item => item.path)).toEqual([
      '/dashboard',
      '/system',
      '/system/users',
      '/system/roles'
    ])
    expect(items[0]).toMatchObject({ title: 'Dashboard', type: 'menu' })
  })
})
