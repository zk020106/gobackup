import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { configEditorApi, type ConfigEditorResponse } from '@/api/config-editor'
import {
  createDeleteOperation,
  createSetOperation,
  summarizeConfigOperations,
  toConfigPointer
} from '@/pages/config-editor-page'
import ConfigEditorPage from '@/pages/config-editor-page'

describe('config editor operations', () => {
  it('creates JSON Pointer paths with escaped map keys', () => {
    expect(toConfigPointer('models', 'demo/name', 'password~value')).toBe(
      '/models/demo~1name/password~0value'
    )
  })

  it('represents ordinary edits and explicit secret deletion as patches', () => {
    const operations = [
      createSetOperation('/web/port', 2904),
      createDeleteOperation('/models/demo/storages/local/password')
    ]

    expect(operations).toEqual([
      { op: 'set', path: '/web/port', value: 2904 },
      { op: 'delete', path: '/models/demo/storages/local/password' }
    ])
    expect(summarizeConfigOperations(operations)).toEqual([
      'SET /web/port',
      'DELETE /models/demo/storages/local/password'
    ])
  })
})

describe('config editor page', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the global/model forms and keeps masked secrets out of the DOM', async () => {
    const response: ConfigEditorResponse = {
      config: {
        models: {
          demo: {
            archive: { includes: ['/tmp'] },
            description: 'Demo backup',
            storages: { local: { path: '/backups', type: 'local' } }
          }
        },
        web: {
          enabled: true,
          host: '127.0.0.1',
          password: { configured: true, masked: '••••••••' },
          port: 2703,
          username: 'admin'
        }
      },
      schema: {
        databases: {},
        global: [],
        model: [],
        notifiers: {},
        sections: {
          archive: [
            { key: 'includes', label: 'Includes', type: 'array' },
            { key: 'excludes', label: 'Excludes', type: 'array' }
          ],
          compress_with: [{ key: 'type', label: 'Type', type: 'string' }],
          encrypt_with: [{ key: 'password', label: 'Password', sensitive: true, type: 'password' }],
          schedule: [{ key: 'enabled', label: 'Enabled', type: 'boolean' }],
          split_with: []
        },
        storages: {
          local: [
            { key: 'type', label: 'Type', type: 'string' },
            { key: 'path', label: 'Path', type: 'string' }
          ]
        },
        version: 1
      },
      version: 'editor-version'
    }
    vi.spyOn(configEditorApi, 'get').mockResolvedValue(response)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ConfigEditorPage)
      )
    )

    expect(await screen.findByText('配置管理')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Demo backup')).toBeInTheDocument()
    expect(screen.getByText('基础设置')).toBeInTheDocument()
    expect(screen.getByText('数据库连接管理')).toBeInTheDocument()
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('editor-secret')
    })
  })
  it('shows Chinese field hints and localized dropdown options', async () => {
    const response: ConfigEditorResponse = {
      config: {
        models: {
          demo: {
            compress_with: { type: 'tgz' },
            storages: { local: { path: '/backups', type: 'local' } }
          }
        },
        web: { enabled: true, host: '127.0.0.1', port: 2703 }
      },
      schema: {
        databases: {},
        global: [],
        model: [],
        notifiers: {},
        sections: {
          archive: [],
          compress_with: [
            {
              description: '打包格式，选 tgz 就可以',
              key: 'type',
              label: '压缩格式',
              option_labels: { tar: 'tar（不压缩）', tgz: 'tgz（最常用）' },
              options: ['tgz', 'tar'],
              type: 'string'
            }
          ],
          encrypt_with: [],
          schedule: [],
          split_with: []
        },
        storages: {
          local: [
            {
              key: 'type',
              label: '存储类型',
              option_labels: { local: 'local（本机目录）', s3: 's3（Amazon S3）' },
              options: ['local', 's3'],
              type: 'string'
            },
            { description: '备份文件存放目录', key: 'path', label: '路径', type: 'string' }
          ]
        },
        version: 1
      },
      version: 'editor-version'
    }
    vi.spyOn(configEditorApi, 'get').mockResolvedValue(response)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ConfigEditorPage)
      )
    )

    // 字段下方的中文说明
    expect(await screen.findByText('备份文件存放目录')).toBeInTheDocument()
    expect(await screen.findByText('打包格式，选 tgz 就可以')).toBeInTheDocument()
    // 下拉框显示中文选项名而不是原始值
    await waitFor(() => {
      expect(document.body.textContent).toContain('local（本机目录）')
      expect(document.body.textContent).toContain('tgz（最常用）')
    })
  })

  it('tests the database connection and loads tables into the picker', async () => {
    const response: ConfigEditorResponse = {
      config: {
        models: {
          venus: {
            databases: {
              venus: {
                host: '127.0.0.1',
                password: { configured: true, masked: '••••••••' },
                tables: ['users'],
                type: 'mysql'
              }
            },
            storages: { local: { path: 'backups/venus', type: 'local' } }
          }
        },
        web: { enabled: true, host: '127.0.0.1', port: 2703 }
      },
      schema: {
        databases: {
          mysql: [
            { key: 'type', label: '类型', options: ['mysql'], type: 'string' },
            { key: 'host', label: '主机地址', type: 'string' },
            { key: 'password', label: '密码', sensitive: true, type: 'password' },
            { key: 'tables', label: '指定的表', table_selector: true, type: 'array' },
            { key: 'exclude_tables', label: '排除的表', table_selector: true, type: 'array' }
          ]
        },
        global: [],
        model: [],
        notifiers: {},
        sections: {
          archive: [],
          compress_with: [],
          encrypt_with: [],
          schedule: [],
          split_with: []
        },
        storages: {
          local: [
            { key: 'type', label: '类型', options: ['local'], type: 'string' },
            { key: 'path', label: '路径', type: 'string' }
          ]
        },
        version: 1
      },
      version: 'editor-version'
    }

    vi.spyOn(configEditorApi, 'get').mockResolvedValue(response)
    const probeSpy = vi.spyOn(configEditorApi, 'probe').mockResolvedValue({
      databases: ['gobackup_e2e', 'venus_test'],
      message: '连接成功：MySQL 8.0.46',
      ok: true,
      tables: ['orders', 'users']
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ConfigEditorPage)
      )
    )

    // 数据库条目的「测试连接」把掩码密码原样带给后端，由后端用已保存的值补齐。
    const testButtons = await screen.findAllByText('测试连接')
    fireEvent.click(testButtons[0])
    await waitFor(() => {
      expect(probeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'test',
          kind: 'database',
          model: 'venus',
          path: '/models/venus/databases/venus',
          type: 'mysql'
        })
      )
    })
    const request = probeSpy.mock.calls[0][0]
    expect((request.value as Record<string, unknown>).password).toEqual({
      configured: true,
      masked: '••••••••'
    })
    await waitFor(() => {
      expect(document.body.textContent).toContain('连接成功：MySQL 8.0.46')
    })

    // 表字段可以从数据库拉取，并在双栏选择器里回填。
    const tableButtons = await screen.findAllByText('获取表')
    fireEvent.click(tableButtons[0])
    await waitFor(() => {
      expect(probeSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'tables' }))
    })
    await waitFor(() => {
      expect(document.body.textContent).toContain('users')
    })
    // 已配置的表会出现在「已选」一侧。
    expect(document.body.textContent).toContain('已选 1')

    // 后端返回数据库列表时，界面直接给出可一键切换的数据库标签，
    // 用户不用回头去找「数据库名」字段。
    expect(document.body.textContent).toContain('快速切换')
    expect(document.body.textContent).toContain('venus_test')
  })

  it('supports switching to schedule matrix view and toggling schedule status', async () => {
    const response: ConfigEditorResponse = {
      config: {
        models: {
          app_db: {
            description: '业务主库',
            databases: { db1: { type: 'postgresql' } },
            schedule: { enabled: true, cron: '0 3 * * *' }
          },
          cache_backup: {
            description: 'Redis缓存',
            databases: { redis1: { type: 'redis' } },
            schedule: { enabled: false }
          }
        },
        web: { enabled: true, host: '127.0.0.1', port: 2703 }
      },
      schema: {
        databases: {},
        global: [],
        model: [],
        notifiers: {},
        sections: {
          archive: [],
          compress_with: [],
          encrypt_with: [],
          schedule: [],
          split_with: []
        },
        storages: {},
        version: 1
      },
      version: 'editor-version'
    }

    vi.spyOn(configEditorApi, 'get').mockResolvedValue(response)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ConfigEditorPage)
      )
    )

    // 默认展示模型工作台
    expect(await screen.findByText('数据库连接管理')).toBeInTheDocument()
    expect(screen.getByText('计划调度总览')).toBeInTheDocument()
    expect(screen.getAllByText('app_db').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('cache_backup')).toBeInTheDocument()

    // 点击切换到「计划调度总览」
    fireEvent.click(screen.getByText('计划调度总览'))

    // 计划调度矩阵表格展示
    await waitFor(() => {
      expect(screen.getByText('cron: 0 3 * * *')).toBeInTheDocument()
    })
    expect(screen.getByText('postgresql:db1')).toBeInTheDocument()
    expect(screen.getByText('redis:redis1')).toBeInTheDocument()

    // 从计划总览点击「调整计划」直达对应模型的计划任务配置
    const adjustButtons = screen.getAllByText('调整计划')
    fireEvent.click(adjustButtons[0])

    // 自动切回模型工作台
    await waitFor(() => {
      expect(screen.getAllByText('计划任务').length).toBeGreaterThanOrEqual(1)
    })
  })
})

