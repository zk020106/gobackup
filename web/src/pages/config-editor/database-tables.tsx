import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { AutoComplete, Button, Input, Select, Tag, Toast, Transfer } from '@douyinfe/semi-ui-19'
import { Database, Plus, RefreshCw } from 'lucide-react'

import { configEditorApi, type ConfigEditorValue, type ConfigProbeResponse } from '@/api/config-editor'
import {
  displayValue,
  pointerSegments,
  toConfigPointer,
  type ProbeContext
} from '@/pages/config-editor/probe-shared'

/**
 * 数据库 / 表选择器。
 *
 * 之前的实现有几个体验问题：
 *   1. 只有在「数据库名」为空时后端才返回数据库列表，所以一旦填了库名就再也
 *      换不了库，只能手动去改「数据库名」输入框；
 *   2. 「指定的表」和「排除的表」是两个独立实例，各自持有一份探测状态，
 *      点两次按钮就连了两次库（每次最长 20 秒），列表还可能不一致；
 *   3. 开着「备份所有数据库」时仍然显示表选择器，点了却只能拿到库列表，
 *      而真按表筛选过之后备份会直接失败（后端不允许两者同时使用）。
 *
 * 这里用一层 Provider 把「库列表 + 表列表」的状态提到数据库节点上，三个字段
 * 共用；库列表改成按需拉取（展开下拉时才请求），表改成带搜索 / 全选 / 清空的
 * 双栏穿梭框，并对 all_databases 做联动提示。
 */

type ProbeAction = 'databases' | 'tables'

interface DatabaseProbeValue {
  allDatabases: boolean
  currentDatabase: string
  databases: string[]
  databasesLoaded: boolean
  disableAllDatabases: () => void
  loadDatabases: (options?: { force?: boolean }) => Promise<void>
  loadTables: (
    overrideDatabase?: string,
    options?: { force?: boolean; silent?: boolean }
  ) => Promise<void>
  loadingDatabases: boolean
  loadingTables: boolean
  message?: string
  messageKind: 'info' | 'error'
  onSet: (path: string, value: ConfigEditorValue) => void
  probe: ProbeContext
  selectDatabase: (database: string) => void
  tables: string[]
  tablesLoadedFor: string
}

const DatabaseProbeContext = createContext<DatabaseProbeValue | undefined>(undefined)

function useDatabaseProbe() {
  const value = useContext(DatabaseProbeContext)

  if (!value) {
    throw new Error('数据库选择器必须放在 DatabaseProbeProvider 里使用')
  }
  return value
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** 数据库节点上的探测状态容器。 */
export function DatabaseProbeProvider({
  children,
  onSet,
  probe
}: {
  children: ReactNode
  onSet: (path: string, value: ConfigEditorValue) => void
  probe: ProbeContext
}) {
  const [databases, setDatabases] = useState<string[]>([])
  const [databasesLoaded, setDatabasesLoaded] = useState(false)
  const [loadingDatabases, setLoadingDatabases] = useState(false)
  const [tables, setTables] = useState<string[]>([])
  const [tablesLoadedFor, setTablesLoadedFor] = useState('')
  const [loadingTables, setLoadingTables] = useState(false)
  const [message, setMessage] = useState<string>()
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info')

  const currentDatabase = displayValue(probe.value.database)
  const allDatabases = probe.value.all_databases === true
  const nodePath = probe.path

  const request = useCallback(
    (action: ProbeAction, value: Record<string, ConfigEditorValue>) =>
      configEditorApi.probe({
        action,
        kind: probe.kind,
        model: probe.modelName,
        path: probe.path,
        type: probe.type,
        value
      }),
    [probe.kind, probe.modelName, probe.path, probe.type]
  )

  const applyResponse = useCallback(
    (response: ConfigProbeResponse, options: { silent?: boolean; successPrefix?: string }) => {
      // 后端在「还没选库」时会连同库列表一起返回，正好用来填充下拉。
      if (response.databases?.length) {
        setDatabases(response.databases)
        setDatabasesLoaded(true)
      }

      if (!response.ok) {
        setMessage(response.message)
        setMessageKind('error')
        if (!options.silent) Toast.error(response.message)
        return false
      }

      setMessage(options.successPrefix ? `${options.successPrefix}：${response.message}` : response.message)
      setMessageKind('info')
      if (!options.silent) Toast.success(response.message)
      return true
    },
    []
  )

  const loadDatabases = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (databasesLoaded && !options.force) return
      if (loadingDatabases) return

      setLoadingDatabases(true)
      try {
        const response = await request('databases', probe.value)
        setDatabases(response.databases ?? [])
        if (!response.ok) {
          setMessage(response.message)
          setMessageKind('error')
        } else {
          setDatabasesLoaded(true)
        }
      } catch (error) {
        setMessage(errorMessage(error, '获取数据库列表失败'))
        setMessageKind('error')
      } finally {
        setLoadingDatabases(false)
      }
    },
    [databasesLoaded, loadingDatabases, probe.value, request]
  )

  const loadTables = useCallback(
    async (
      overrideDatabase?: string,
      options: { force?: boolean; silent?: boolean } = {}
    ) => {
      const target = overrideDatabase ?? currentDatabase
      if (!options.force && tablesLoadedFor === target && tables.length > 0) return
      if (loadingTables) return

      setLoadingTables(true)
      try {
        const value =
          overrideDatabase === undefined
            ? probe.value
            : ({ ...probe.value, database: overrideDatabase } as Record<string, ConfigEditorValue>)
        const response = await request('tables', value)
        if (applyResponse(response, options)) {
          setTables(response.tables ?? [])
          setTablesLoadedFor(target)
        }
      } catch (error) {
        setMessage(errorMessage(error, '获取表列表失败'))
        setMessageKind('error')
        if (!options.silent) Toast.error(errorMessage(error, '获取表列表失败'))
      } finally {
        setLoadingTables(false)
      }
    },
    [applyResponse, currentDatabase, loadingTables, probe.value, request, tables.length, tablesLoadedFor]
  )

  /** 选库：写入 database 字段并立刻按新库拉表。 */
  const selectDatabase = useCallback(
    (database: string) => {
      onSet(toConfigPointer(...pointerSegments(nodePath), 'database'), database)
      void loadTables(database, { force: true, silent: true })
    },
    [loadTables, nodePath, onSet]
  )

  /** 关闭「备份所有数据库」，让表筛选重新可用。 */
  const disableAllDatabases = useCallback(() => {
    onSet(toConfigPointer(...pointerSegments(nodePath), 'all_databases'), false)
    void loadTables(undefined, { force: true })
  }, [loadTables, nodePath, onSet])

  const value = useMemo<DatabaseProbeValue>(
    () => ({
      allDatabases,
      currentDatabase,
      databases,
      databasesLoaded,
      disableAllDatabases,
      loadDatabases,
      loadTables,
      loadingDatabases,
      loadingTables,
      message,
      messageKind,
      onSet,
      probe,
      selectDatabase,
      tables,
      tablesLoadedFor
    }),
    [
      allDatabases,
      currentDatabase,
      databases,
      databasesLoaded,
      disableAllDatabases,
      loadDatabases,
      loadTables,
      loadingDatabases,
      loadingTables,
      message,
      messageKind,
      onSet,
      probe,
      selectDatabase,
      tables,
      tablesLoadedFor
    ]
  )

  return <DatabaseProbeContext.Provider value={value}>{children}</DatabaseProbeContext.Provider>
}

/** 「数据库名」字段：可下拉选库，也可以直接手填。 */
export function DatabaseNameEditor({
  onSet,
  path,
  value
}: {
  onSet: (path: string, value: ConfigEditorValue) => void
  path: string
  value: ConfigEditorValue | undefined
}) {
  const probe = useDatabaseProbe()
  const current = displayValue(value)

  return (
    <div className="flex items-center gap-2">
      <AutoComplete
        className="min-w-0 flex-1"
        data={probe.databases}
        emptyContent={probe.loadingDatabases ? '正在读取数据库列表…' : '没有可选项，可以直接输入'}
        loading={probe.loadingDatabases}
        placeholder="可以直接填写，也可以先拉取列表"
        showClear
        value={current}
        onChange={next => onSet(path, next ?? '')}
        onFocus={() => void probe.loadDatabases()}
      />
      <Button
        icon={<RefreshCw className="size-4" />}
        loading={probe.loadingDatabases}
        size="small"
        theme="light"
        type="tertiary"
        onClick={() => void probe.loadDatabases({ force: true })}
      >
        获取列表
      </Button>
    </div>
  )
}

/** tables / exclude_tables 字段：选库 + 双栏选表。 */
export function DatabaseTableField({
  description,
  fieldKey,
  onSet,
  path,
  showDatabasePicker = true,
  value
}: {
  description?: string
  fieldKey: string
  onSet: (path: string, value: ConfigEditorValue) => void
  path: string
  /**
   * 是否渲染「目标数据库」那一行。一个数据库节点里有两个表字段时只渲染一次，
   * 避免同一个库选择器重复出现两遍。
   */
  showDatabasePicker?: boolean
  value: ConfigEditorValue | undefined
}) {
  const probe = useDatabaseProbe()
  const [manualName, setManualName] = useState('')

  const selected = useMemo(
    () => (Array.isArray(value) ? value : []).map(item => displayValue(item)).filter(Boolean),
    [value]
  )

  // 已选但不在当前列表里的表（手填的、或换了库之后不在列表里的）也要能显示和移除。
  const dataSource = useMemo(
    () =>
      Array.from(new Set([...probe.tables, ...selected]))
        .sort((left, right) => left.localeCompare(right))
        .map(item => ({ key: item, label: item, value: item })),
    [probe.tables, selected]
  )

  const databaseOptions = useMemo(
    () =>
      Array.from(new Set([...probe.databases, probe.currentDatabase].filter(Boolean))).map(item => ({
        label: item,
        value: item
      })),
    [probe.currentDatabase, probe.databases]
  )

  function changeSelection(next: Array<string | number>) {
    onSet(
      path,
      next.map(item => String(item))
    )
  }

  function addManualTable() {
    const name = manualName.trim()
    if (!name) return
    if (!selected.includes(name)) {
      changeSelection([...selected, name])
    }
    setManualName('')
  }

  if (probe.allDatabases) {
    return (
      <div className="grid gap-2 rounded-md border border-dashed px-3 py-2">
        <div className="text-xs text-muted-foreground">
          当前开启了「备份所有数据库」，备份会覆盖整个实例，因此不能再按表筛选
          （两者同时配置时数据库会直接报错）。
        </div>
        <div>
          <Button
            icon={<Database className="size-4" />}
            size="small"
            theme="light"
            type="primary"
            onClick={probe.disableAllDatabases}
          >
            关闭「备份所有数据库」并按表选择
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {showDatabasePicker ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2">
            <span className="shrink-0 text-xs text-muted-foreground">目标数据库</span>
            <Select
              className="w-56"
              filter
              loading={probe.loadingDatabases}
              optionList={databaseOptions}
              placeholder={probe.databasesLoaded ? '选择数据库' : '展开以读取数据库列表'}
              value={probe.currentDatabase || undefined}
              onChange={next => probe.selectDatabase(String(next))}
              onDropdownVisibleChange={visible => {
                if (visible) void probe.loadDatabases()
              }}
            />
            <Button
              aria-label="刷新数据库列表"
              icon={<RefreshCw className="size-4" />}
              loading={probe.loadingDatabases}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => void probe.loadDatabases({ force: true })}
            />
            {probe.currentDatabase ? (
              <Tag color="blue">{probe.currentDatabase}</Tag>
            ) : (
              <Tag color="orange">未指定，先选一个库</Tag>
            )}
            <Button
              className="ml-auto"
              icon={<RefreshCw className="size-4" />}
              loading={probe.loadingTables}
              size="small"
              theme="light"
              type="tertiary"
              onClick={() => void probe.loadTables(undefined, { force: true })}
            >
              获取表
            </Button>
          </div>

          {/*
            库不多的时候直接把其它库列成可点的标签：切换目标库是最常见的操作，
            比每次展开下拉再找一次快得多；库很多时仍然用上面的下拉搜索。
          */}
          {probe.databases.length > 1 && probe.databases.length <= 12 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground">快速切换：</span>
              {probe.databases
                .filter(name => name !== probe.currentDatabase)
                .map(name => (
                  <Tag
                    className="cursor-pointer"
                    color="blue"
                    key={name}
                    onClick={() => probe.selectDatabase(name)}
                  >
                    {name}
                  </Tag>
                ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>目标数据库：{probe.currentDatabase || '未指定'}</span>
          <Button
            icon={<RefreshCw className="size-4" />}
            loading={probe.loadingTables}
            size="small"
            theme="light"
            type="tertiary"
            onClick={() => void probe.loadTables(undefined, { force: true })}
          >
            获取表
          </Button>
        </div>
      )}

      <Transfer
        emptyContent={{
          left: '没有可选的表，先选择数据库并点「获取表」',
          right: '还没有选择任何表'
        }}
        dataSource={dataSource}
        filter
        inputProps={{ placeholder: '搜索表名' }}
        loading={probe.loadingTables}
        pagination={dataSource.length > 200 ? { pageSize: 200 } : undefined}
        style={{ width: '100%' }}
        value={selected}
        onChange={changeSelection}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          placeholder="手动添加表名后回车"
          size="small"
          value={manualName}
          onChange={setManualName}
          onEnterPress={addManualTable}
        />
        <Button icon={<Plus className="size-4" />} size="small" theme="light" type="tertiary" onClick={addManualTable}>
          添加
        </Button>
        <span className="text-xs text-muted-foreground">
          共 {probe.tables.length} 张表 · 已选 {selected.length}
          {probe.tablesLoadedFor ? ` · 列表来自 ${probe.tablesLoadedFor}` : ''}
        </span>
      </div>

      {probe.message ? (
        <div
          className={
            probe.messageKind === 'error'
              ? 'text-[11px] leading-4 break-all text-destructive'
              : 'text-[11px] leading-4 break-all text-muted-foreground'
          }
        >
          {probe.message}
        </div>
      ) : null}
      {description ? (
        <div className="text-[11px] leading-4 text-muted-foreground/70">{description}</div>
      ) : null}
      {fieldKey === 'tables' ? (
        <div className="text-[11px] leading-4 text-muted-foreground/70">
          留空表示整库备份；只勾选其中几张时，未勾选的表不会进入备份。
        </div>
      ) : null}
    </div>
  )
}
