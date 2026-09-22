import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AdminTable } from '@/components/admin/table/admin-table'

type DemoRecord = {
  id: string
  name: string
}

const columns = [{ dataIndex: 'name', key: 'name', title: '姓名' }]
const dataSource: DemoRecord[] = [
  { id: 'a', name: '超级管理员' },
  { id: 'b', name: '运营账号' }
]

describe('admin table', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders columns, rows and the toolbar slot', () => {
    render(
      <AdminTable<DemoRecord>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        toolbar={<button type="button">新增用户</button>}
      />
    )

    expect(screen.getByText('姓名')).toBeInTheDocument()
    expect(screen.getByText('超级管理员')).toBeInTheDocument()
    expect(screen.getByText('运营账号')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增用户' })).toBeInTheDocument()
  })

  it('omits the toolbar row when no toolbar is provided', () => {
    const { container } = render(
      <AdminTable<DemoRecord> columns={columns} dataSource={dataSource} rowKey="id" />
    )

    expect(container.querySelector("[data-slot='admin-table']")?.childElementCount).toBe(1)
  })
})
