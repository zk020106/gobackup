import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import { configEditorApi, type ConfigEditorValue, type ConfigProbeResponse } from '@/api/config-editor'
import {
  DatabaseNameEditor,
  DatabaseProbeProvider,
  DatabaseTableField
} from '@/pages/config-editor/database-tables'
import type { ProbeContext } from '@/pages/config-editor/probe-shared'

vi.mock('@/api/config-editor', () => ({
  configEditorApi: { probe: vi.fn() }
}))

const probeMock = vi.mocked(configEditorApi.probe)

type OnSet = (path: string, value: ConfigEditorValue) => void

function createProbe(value: Record<string, unknown> = {}): ProbeContext {
  return {
    kind: 'database',
    modelName: 'venus',
    path: '/models/venus/databases/main',
    type: 'mysql',
    value: { type: 'mysql', host: '127.0.0.1', database: 'venus', ...value }
  }
}

function renderPicker(options: { onSet?: Mock<OnSet>; value?: Record<string, unknown> } = {}) {
  const onSet = options.onSet ?? vi.fn<OnSet>()
  const probe = createProbe(options.value)

  render(
    <DatabaseProbeProvider onSet={onSet} probe={probe}>
      <DatabaseNameEditor
        path="/models/venus/databases/main/database"
        value={probe.value.database as string}
        onSet={onSet}
      />
      <DatabaseTableField
        fieldKey="tables"
        path="/models/venus/databases/main/tables"
        value={[]}
        onSet={onSet}
      />
      <DatabaseTableField
        fieldKey="exclude_tables"
        path="/models/venus/databases/main/exclude_tables"
        showDatabasePicker={false}
        value={['legacy_table']}
        onSet={onSet}
      />
    </DatabaseProbeProvider>
  )

  return { onSet, probe }
}

function tablesResponse(overrides: Partial<ConfigProbeResponse> = {}): ConfigProbeResponse {
  return { message: '连接成功，数据库 venus 共 2 张表', ok: true, tables: ['orders', 'users'], ...overrides }
}

function probeCalls() {
  return probeMock.mock.calls.map(call => ({
    action: call[0].action,
    database: (call[0].value as Record<string, unknown> | undefined)?.database
  }))
}

describe('数据库 / 表选择器', () => {
  afterEach(() => {
    cleanup()
    probeMock.mockReset()
  })

  it('两个表字段共用一次探测结果', async () => {
    probeMock.mockResolvedValue(tablesResponse())
    renderPicker()

    const loadButtons = screen.getAllByRole('button', { name: /^获取表$/ })
    expect(loadButtons.length).toBe(2)

    fireEvent.click(loadButtons[0])

    await waitFor(() => expect(probeMock).toHaveBeenCalledTimes(1))
    expect(probeMock.mock.calls[0][0]).toMatchObject({
      action: 'tables',
      kind: 'database',
      path: '/models/venus/databases/main',
      type: 'mysql',
      value: { database: 'venus' }
    })
    expect(probeCalls()).toEqual([{ action: 'tables', database: 'venus' }])

    // 「指定的表」拿到列表后，「排除的表」字段直接复用同一份数据，不再连库。
    expect((await screen.findAllByText('orders')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('legacy_table').length).toBeGreaterThan(0)
    expect(probeMock).toHaveBeenCalledTimes(1)
  })

  it('「获取表」是显式刷新：再点一次会重新探测', async () => {
    probeMock.mockResolvedValue(tablesResponse())
    renderPicker()

    fireEvent.click(screen.getAllByRole('button', { name: /^获取表$/ })[0])
    await waitFor(() => expect(probeMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getAllByRole('button', { name: /^获取表$/ })[1])
    await waitFor(() => expect(probeMock).toHaveBeenCalledTimes(2))
    expect(probeCalls()[1]).toEqual({ action: 'tables', database: 'venus' })
  })

  it('「获取列表」拉取数据库清单', async () => {
    probeMock.mockResolvedValue({ message: '连接成功，共 3 个数据库', ok: true, databases: ['a', 'b', 'venus'] })
    renderPicker()

    fireEvent.click(screen.getAllByRole('button', { name: /获取列表/ })[0])

    await waitFor(() => expect(probeMock).toHaveBeenCalledTimes(1))
    expect(probeMock.mock.calls[0][0]).toMatchObject({ action: 'databases', type: 'mysql' })
  })

  it('未选库时点获取表会把返回的库列表填进下拉，并提示未指定', async () => {
    probeMock.mockResolvedValue({
      message: '连接成功。当前配置未指定「数据库名」；请在下方选择数据库',
      ok: true,
      databases: ['venus', 'yuntai']
    })
    renderPicker({ value: { database: '' } })

    fireEvent.click(screen.getAllByRole('button', { name: /^获取表$/ })[0])

    await waitFor(() => expect(probeMock).toHaveBeenCalledTimes(1))
    // 目标数据库选择器只渲染一次（在第一个表字段上），第二个字段只显示当前库。
    expect(screen.getAllByText('未指定，先选一个库').length).toBe(1)
    expect(screen.getByText('目标数据库：未指定')).toBeInTheDocument()
    expect(probeCalls()[0].database).toBe('')
  })

  it('快速切换数据库会写回 database 字段并按新库重新拉表', async () => {
    probeMock.mockResolvedValue({ message: 'ok', ok: true, databases: ['venus', 'yuntai'] })
    const { onSet } = renderPicker()

    // 展开下拉只是加载库列表；选中走「快速切换」标签或下拉选项。
    const trigger = document.querySelector('.semi-select') as HTMLElement
    fireEvent.mouseDown(trigger)
    fireEvent.click(trigger)

    await waitFor(() => expect(probeCalls().some(call => call.action === 'databases')).toBe(true))

    probeMock.mockResolvedValue(tablesResponse())
    // 两个表字段都会渲染快速切换标签，取第一个即可。
    const chip = screen.getAllByText('yuntai')[0]
    fireEvent.click(chip)

    await waitFor(() =>
      expect(onSet).toHaveBeenCalledWith('/models/venus/databases/main/database', 'yuntai')
    )
    await waitFor(() => expect(probeCalls().at(-1)).toEqual({ action: 'tables', database: 'yuntai' }))
  })

  it('库列表已加载时切换不需要重新探测数据库', async () => {
    probeMock.mockResolvedValue({
      message: 'ok',
      ok: true,
      databases: ['venus', 'yuntai'],
      tables: ['orders']
    })
    renderPicker()

    fireEvent.click(screen.getAllByRole('button', { name: /^获取表$/ })[0])
    await waitFor(() => expect(probeMock).toHaveBeenCalledTimes(1))

    // 「未选库→获取表」这种响应里带库列表的情况，应该直接出现快速切换标签。
    expect(screen.queryAllByText('yuntai').length).toBeGreaterThan(0)
  })

  it('开启「备份所有数据库」时给出说明，并能一键关闭', async () => {
    const { onSet } = renderPicker({ value: { all_databases: true } })

    expect(screen.getAllByText(/备份所有数据库/).length).toBeGreaterThan(0)
    // 表选择器被替换成提示，不渲染穿梭框。
    expect(screen.queryByPlaceholderText('搜索表名')).not.toBeInTheDocument()

    probeMock.mockResolvedValue(tablesResponse())
    fireEvent.click(screen.getAllByRole('button', { name: /并按表选择$/ })[0])

    await waitFor(() =>
      expect(onSet).toHaveBeenCalledWith('/models/venus/databases/main/all_databases', false)
    )
    await waitFor(() => expect(probeCalls().at(-1)).toEqual({ action: 'tables', database: 'venus' }))
  })

  it('可以手动补充表名（按钮与回车都支持）', async () => {
    probeMock.mockResolvedValue(tablesResponse())
    const { onSet } = renderPicker()

    const inputs = screen.getAllByPlaceholderText('手动添加表名后回车')
    fireEvent.change(inputs[0], { target: { value: 'archive_2024' } })
    fireEvent.click(screen.getAllByRole('button', { name: '添加' })[0])

    await waitFor(() =>
      expect(onSet).toHaveBeenCalledWith('/models/venus/databases/main/tables', ['archive_2024'])
    )

    // Semi 的 Input 在 keypress 上派发 onEnterPress。
    fireEvent.change(inputs[1], { target: { value: 'by_enter' } })
    fireEvent.keyPress(inputs[1], { key: 'Enter', charCode: 13 })

    await waitFor(() =>
      expect(onSet).toHaveBeenCalledWith('/models/venus/databases/main/exclude_tables', [
        'legacy_table',
        'by_enter'
      ])
    )
  })

  it('在左侧勾选表会写回数组', async () => {
    probeMock.mockResolvedValue(tablesResponse())
    const { onSet } = renderPicker()

    fireEvent.click(screen.getAllByRole('button', { name: /^获取表$/ })[0])
    await screen.findAllByText('orders')

    const transfers = document.querySelectorAll('.semi-transfer')
    expect(transfers.length).toBe(2)

    fireEvent.click(within(transfers[0] as HTMLElement).getAllByRole('checkbox')[0])

    await waitFor(() =>
      expect(onSet).toHaveBeenCalledWith('/models/venus/databases/main/tables', ['orders'])
    )
  })

  it('已选但不在列表里的表仍然显示在右侧，不会被丢掉', async () => {
    probeMock.mockResolvedValue(tablesResponse())
    renderPicker()

    fireEvent.click(screen.getAllByRole('button', { name: /^获取表$/ })[0])
    await screen.findAllByText('orders')

    // exclude_tables 里配置的 legacy_table 不在数据库返回的列表里。
    const transfers = document.querySelectorAll('.semi-transfer')
    expect(within(transfers[1] as HTMLElement).getAllByText('legacy_table').length).toBeGreaterThan(0)
  })
})
