import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AutoComplete,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Tag,
  TextArea,
  Toast
} from '@douyinfe/semi-ui-19'
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Copy,
  Database,
  FileArchive,
  HardDrive,
  Layers,
  Plus,
  PlugZap,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2
} from 'lucide-react'

import {
  configEditorApi,
  type ConfigEditorField,
  type ConfigEditorMaskedValue,
  type ConfigEditorOperation,
  type ConfigEditorSchema,
  type ConfigEditorValue,
  type ConfigProbeResponse
} from '@/api/config-editor'
import { HttpError } from '@/lib/http'
import { Page, PageSection } from '@/components/page'
import { DatabaseNameEditor, DatabaseProbeProvider, DatabaseTableField } from '@/pages/config-editor/database-tables'
import {
  DbxNewConnectionModal,
  getDatabaseEngineName,
  getDatabaseIcon,
  type DatabaseEngineDef
} from '@/pages/config-editor/dbx-new-connection-modal'
import {
  displayValue,
  pointerSegments,
  toConfigPointer,
  type ConfigObject,
  type ProbeContext,
  type ProbeKind
} from '@/pages/config-editor/probe-shared'

// 配置编辑器需要复用 JSON Pointer 工具；测试也从这里导入 toConfigPointer。
export { toConfigPointer }

export function createSetOperation(path: string, value: ConfigEditorValue): ConfigEditorOperation {
  return { op: 'set', path, value }
}

export function createDeleteOperation(path: string): ConfigEditorOperation {
  return { op: 'delete', path }
}

export function summarizeConfigOperations(operations: ConfigEditorOperation[]) {
  return operations.map(operation => `${operation.op.toUpperCase()} ${operation.path || '/'}`)
}

const emptyObject: ConfigObject = {}

// ---- 中文文案 ----

// 配置容器段的中文名，用于变更确认里的路径描述。
const sectionLabels: Record<string, string> = {
  archive: '归档',
  compress_with: '压缩',
  databases: '数据库',
  encrypt_with: '加密',
  models: '模型',
  notifiers: '通知',
  schedule: '计划',
  split_with: '分片',
  storages: '存储',
  web: '基础设置'
}

// 存放「具名条目」的段：它们的下级是用户自己起的名字（模型名、存储名），
// 不能再按字段名翻译。
const namedContainers = new Set(['models', 'databases', 'storages', 'notifiers'])

// 后端 schema 已经覆盖了内置字段的中文名。这张表是兜底用的：用户在 YAML 里
// 手写了 schema 之外的字段时，标题不会退化成一串英文。
const fallbackFieldLabels: Record<string, string> = {
  access_key_id: 'Access Key ID',
  account: '存储账号',
  after_script: '备份后脚本',
  all_databases: '备份所有数据库',
  args: '附加参数',
  at: '执行时刻',
  authdb: '认证数据库',
  base64: 'Base64 输出',
  before_script: '备份前脚本',
  bucket: '存储桶 Bucket',
  chunk_size: '分片大小',
  compress: '压缩方式',
  cron: 'Cron 表达式',
  database: '数据库名',
  default_storage: '默认存储',
  description: '说明',
  enabled: '是否启用',
  endpoint: '服务地址',
  endpoints: '服务地址列表',
  every: '执行间隔',
  exclude_tables: '排除的表',
  excludes: '排除路径',
  filename_format: '文件名格式',
  host: '主机地址',
  includes: '包含路径',
  keep: '保留份数',
  mode: '备份模式',
  on_exit: '脚本执行时机',
  on_failure: '失败时通知',
  on_success: '成功时通知',
  password: '密码',
  path: '路径',
  port: '端口',
  private_key: '私钥文件',
  rdb_path: 'RDB 文件路径',
  region: '区域 Region',
  secret_access_key: 'Secret Access Key',
  socket: 'Socket 路径',
  sslmode: 'SSL 模式',
  suffix_length: '后缀位数',
  tables: '指定的表',
  timeout: '超时时间（秒）',
  tls: '启用 TLS',
  token: 'Token',
  type: '类型',
  uri: '连接串 URI',
  url: '通知地址',
  username: '用户名',
  workdir: '工作目录'
}

function fieldLabel(key: string) {
  const known = fallbackFieldLabels[key]
  if (known) return known
  return key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

// 把 JSON Pointer 翻译成「模型 venus › 计划 › 执行时刻」这种可读描述。
function describeConfigPath(path: string) {
  const segments = pointerSegments(path)
  const parts: string[] = []

  segments.forEach((segment, index) => {
    const parent = segments[index - 1]
    if (parent && namedContainers.has(parent)) {
      parts.push(segment)
      return
    }
    parts.push(sectionLabels[segment] ?? fieldLabel(segment))
  })

  return parts.length === 0 ? '根配置' : parts.join(' › ')
}

// 变更确认弹窗用的中文描述。summarizeConfigOperations 保持原样，
// 因为它是导出给测试用的机器可读格式。
export function describeConfigOperations(operations: ConfigEditorOperation[]) {
  return operations.map(operation => {
    const target = describeConfigPath(operation.path)
    if (operation.op === 'delete') {
      return `删除 ${target}`
    }
    if (operation.path.endsWith('/-')) {
      return `新增一项 ${describeConfigPath(operation.path.slice(0, -2))}`
    }
    const shown = isMaskedValue(operation.value) ? '已配置' : displayValue(operation.value)
    return shown === '' ? `清空 ${target}` : `设置 ${target} = ${shown}`
  })
}

// ---- 值处理 ----

function isMaskedValue(value: ConfigEditorValue | undefined): value is ConfigEditorMaskedValue {
  return isRecord(value) && typeof value.masked === 'string' && typeof value.configured === 'boolean'
}

function isRecord(value: unknown): value is ConfigObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneConfigValue(value: ConfigEditorValue): ConfigEditorValue {
  if (Array.isArray(value)) {
    return value.map(item => cloneConfigValue(item))
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneConfigValue(child)])
    )
  }
  return value
}

function valuesAsObject(value: ConfigEditorValue | undefined): ConfigObject {
  return isRecord(value) ? value : emptyObject
}

function setAtPath(root: ConfigObject, path: string, value: ConfigEditorValue): ConfigObject {
  const segments = pointerSegments(path)
  if (segments.length === 0) {
    return isRecord(value) ? (cloneConfigValue(value) as ConfigObject) : root
  }

  const next = cloneConfigValue(root) as ConfigObject
  let cursor: ConfigEditorValue = next
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1
    if (Array.isArray(cursor)) {
      const arrayIndex = segment === '-' ? cursor.length : Number(segment)
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0) return
      if (last) {
        if (segment === '-') cursor.push(cloneConfigValue(value))
        else cursor[arrayIndex] = cloneConfigValue(value)
        return
      }
      if (!cursor[arrayIndex] || typeof cursor[arrayIndex] !== 'object') {
        cursor[arrayIndex] = {}
      }
      cursor = cursor[arrayIndex]
      return
    }
    if (!isRecord(cursor)) return
    if (last) {
      cursor[segment] = cloneConfigValue(value)
      return
    }
    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      cursor[segment] = {}
    }
    cursor = cursor[segment]
  })
  return next
}

function deleteAtPath(root: ConfigObject, path: string): ConfigObject {
  const segments = pointerSegments(path)
  if (segments.length === 0) return root
  const next = cloneConfigValue(root) as ConfigObject
  const last = segments.pop()!
  let cursor: ConfigEditorValue = next
  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(segment)]
    } else if (isRecord(cursor)) {
      cursor = cursor[segment]
    } else {
      return next
    }
  }
  if (Array.isArray(cursor)) {
    const index = Number(last)
    if (Number.isInteger(index) && index >= 0 && index < cursor.length) cursor.splice(index, 1)
  } else if (isRecord(cursor)) {
    delete cursor[last]
  }
  return next
}

function addOperation(
  current: ConfigEditorOperation[],
  operation: ConfigEditorOperation
): ConfigEditorOperation[] {
  if (operation.path.endsWith('/-')) return [...current, operation]
  const samePath = current.findIndex(item => item.path === operation.path)
  if (samePath < 0) return [...current, operation]
  return current.map((item, index) => (index === samePath ? operation : item))
}

function optionList(values: string[], labels?: Record<string, string>) {
  return values.map(value => ({ label: labels?.[value] ?? value, value }))
}

// 下拉框里保留原有值，避免 YAML 里已经写了自定义值时选项对不上、显示成空。
function withCurrentValue(values: string[], current: string) {
  if (!current || values.includes(current)) return values
  return [...values, current]
}

// 类型下拉的中文名统一从 schema 的 type 字段取，不用两处维护同一份映射。
function schemaTypeLabels(schema: Record<string, ConfigEditorField[]>) {
  for (const fields of Object.values(schema)) {
    const typeField = fields.find(field => field.key === 'type')
    if (typeField?.option_labels) return typeField.option_labels
  }
  return undefined
}

// ---- 编辑控件 ----

function SecretEditor({
  path,
  value,
  onDelete,
  onSet
}: {
  path: string
  value: ConfigEditorMaskedValue | string | undefined
  onDelete: (path: string) => void
  onSet: (path: string, value: ConfigEditorValue) => void
}) {
  const configured = isMaskedValue(value) ? value.configured : Boolean(value)
  const draft = typeof value === 'string' ? value : ''

  return (
    <div className="flex items-center gap-2">
      <Input
        className="min-w-0 flex-1"
        mode="password"
        placeholder={configured ? '已配置（不会回显）' : '未配置'}
        value={draft}
        onChange={next => onSet(path, next)}
      />
      {configured ? (
        <Button
          aria-label={`清除 ${path}`}
          icon={<Trash2 className="size-4" />}
          size="small"
          theme="borderless"
          type="tertiary"
          onClick={() => onDelete(path)}
        >
          清除
        </Button>
      ) : null}
    </div>
  )
}

function ScalarEditor({
  keyName,
  path,
  value,
  onSet,
  valueType
}: {
  keyName: string
  path: string
  value: ConfigEditorValue
  onSet: (path: string, value: ConfigEditorValue) => void
  valueType?: string
}) {
  if (typeof value === 'boolean') {
    return <Switch checked={value} onChange={checked => onSet(path, checked)} />
  }
  if (typeof value === 'number' || valueType === 'number') {
    return (
      <InputNumber
        className="w-full"
        hideButtons
        value={typeof value === 'number' || typeof value === 'string' ? value : ''}
        onChange={next => {
          if (next === '') {
            onSet(path, '')
            return
          }
          const numeric = Number(next)
          if (!Number.isNaN(numeric)) onSet(path, numeric)
        }}
      />
    )
  }

  const text = displayValue(value)
  const multiline = text.includes('\n') || keyName.endsWith('script') || keyName === 'args'
  if (multiline) {
    return (
      <TextArea
        autosize={{ maxRows: 8, minRows: 3 }}
        value={text}
        onChange={next => onSet(path, next)}
      />
    )
  }
  return <Input showClear value={text} onChange={next => onSet(path, next)} />
}

function ArrayEditor({
  path,
  value,
  onDelete,
  onSet
}: {
  path: string
  value: ConfigEditorValue[]
  onDelete: (path: string) => void
  onSet: (path: string, value: ConfigEditorValue) => void
}) {
  return (
    <div className="grid gap-2">
      {value.map((item, index) => {
        const itemPath = toConfigPointer(...pointerSegments(path), String(index))
        const itemValue = displayValue(item)
        return (
          <div className="flex items-start gap-2" key={`${itemPath}-${index}`}>
            {isRecord(item) || Array.isArray(item) ? (
              <TextArea
                autosize={{ maxRows: 6, minRows: 2 }}
                className="min-w-0 flex-1"
                value={itemValue}
                onChange={next => {
                  try {
                    onSet(itemPath, JSON.parse(next) as ConfigEditorValue)
                  } catch {
                    // Keep the last valid JSON value until the user finishes typing.
                  }
                }}
              />
            ) : (
              <Input
                className="min-w-0 flex-1"
                value={itemValue}
                onChange={next => onSet(itemPath, next)}
              />
            )}
            <Button
              aria-label={`删除 ${itemPath}`}
              icon={<Trash2 className="size-4" />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => onDelete(itemPath)}
            />
          </div>
        )
      })}
      <Button
        className="w-fit"
        icon={<Plus className="size-4" />}
        size="small"
        theme="light"
        type="tertiary"
        onClick={() => onSet(`${path}/-`, '')}
      >
        添加一项
      </Button>
    </div>
  )
}

function ObjectFields({
  value,
  path,
  skipKeys = [],
  onDelete,
  onSet
}: {
  value: ConfigEditorValue | undefined
  path: string
  skipKeys?: string[]
  onDelete: (path: string) => void
  onSet: (path: string, value: ConfigEditorValue) => void
}) {
  const entries = Object.entries(valuesAsObject(value)).filter(([key]) => !skipKeys.includes(key))
  if (entries.length === 0) {
    return <Empty description="暂无字段" />
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, child]) => {
        const childPath = toConfigPointer(...pointerSegments(path), key)
        const isObject = isRecord(child) && !isMaskedValue(child)
        return (
          <div className={isObject || Array.isArray(child) ? 'sm:col-span-2' : ''} key={childPath}>
            <div className="mb-1 text-xs font-medium text-muted-foreground">{fieldLabel(key)}</div>
            {isMaskedValue(child) || typeof child === 'string' && isSensitiveKey(key) ? (
              <SecretEditor
                path={childPath}
                value={child as ConfigEditorMaskedValue | string}
                onDelete={onDelete}
                onSet={onSet}
              />
            ) : Array.isArray(child) ? (
              <ArrayEditor path={childPath} value={child} onDelete={onDelete} onSet={onSet} />
            ) : isObject ? (
                <Card className="bg-background-deep" shadows="always" title={fieldLabel(key)}>
                <ObjectFields
                  path={childPath}
                  value={child}
                  onDelete={onDelete}
                  onSet={onSet}
                />
              </Card>
            ) : (
              <ScalarEditor keyName={key} path={childPath} value={child} onSet={onSet} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// 字段缺失时的取值。后端会在 schema 里下发 default（例如计划任务默认是启用的），
// 这样界面显示的就是运行时真正生效的值，而不是布尔零值。
function defaultFieldValue(field: ConfigEditorField): ConfigEditorValue {
  if (field.default !== undefined) {
    return field.default
  }
  switch (field.type) {
    case 'boolean':
      return false
    case 'array':
      return []
    default:
      return ''
  }
}

function FieldLabel({ field }: { field: ConfigEditorField }) {
  return (
    <div className="mb-1 text-xs font-medium text-muted-foreground">
      {field.label || fieldLabel(field.key)}
      {field.required ? <span className="ml-1 text-destructive">*</span> : null}
    </div>
  )
}

// 「测试连接」按钮：数据库 / 存储条目卡片右上角使用。
function ConnectionProbeButton({
  onResult,
  probe
}: {
  onResult: (response: ConfigProbeResponse) => void
  probe: ProbeContext
}) {
  const [loading, setLoading] = useState(false)

  async function testConnection() {
    setLoading(true)
    try {
      const response = await configEditorApi.probe({
        action: 'test',
        kind: probe.kind,
        model: probe.modelName,
        path: probe.path,
        type: probe.type,
        value: probe.value
      })
      onResult(response)
      if (response.ok) {
        Toast.success(response.message)
      } else {
        Toast.error(response.message)
      }
    } catch (error) {
      Toast.error(errorMessage(error, '测试连接失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      icon={<PlugZap className="size-4" />}
      loading={loading}
      size="small"
      theme="light"
      type="tertiary"
      onClick={() => void testConnection()}
    >
      测试连接
    </Button>
  )
}

function SchemaObjectFields({
  value,
  path,
  fields,
  hideType = false,
  probe,
  onDelete,
  onSet
}: {
  value: ConfigEditorValue | undefined
  path: string
  fields: ConfigEditorField[]
  hideType?: boolean
  probe?: ProbeContext
  onDelete: (path: string) => void
  onSet: (path: string, value: ConfigEditorValue) => void
}) {
  const object = valuesAsObject(value)
  const knownKeys = new Set(fields.map(field => field.key))
  const unknown = Object.fromEntries(
    Object.entries(object).filter(([key]) => !knownKeys.has(key))
  )
  // 一个数据库节点里可能有「指定的表」和「排除的表」两个表字段，
  // 目标数据库选择器只放在第一个上，避免重复渲染。
  const firstTableField = fields.find(field => field.table_selector)?.key

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields
          .filter(field => !hideType || field.key !== 'type')
          .map(field => {
            const fieldPath = toConfigPointer(...pointerSegments(path), field.key)
            const current = object[field.key]
            const value = current ?? defaultFieldValue(field)
            const wide =
              field.type === 'array' ||
              field.type === 'text' ||
              field.type === 'object' ||
              field.key === 'args'
            return (
              <div className={wide ? 'sm:col-span-2' : ''} key={fieldPath}>
                <FieldLabel field={field} />
                {field.sensitive || field.type === 'password' ? (
                  <SecretEditor
                    path={fieldPath}
                    value={current as ConfigEditorMaskedValue | string | undefined}
                    onDelete={onDelete}
                    onSet={onSet}
                  />
                ) : field.table_selector && probe?.kind === 'database' ? (
                  <DatabaseTableField
                    description={field.description}
                    fieldKey={field.key}
                    path={fieldPath}
                    showDatabasePicker={field.key === firstTableField}
                    value={current}
                    onSet={onSet}
                  />
                ) : field.key === 'database' && probe?.kind === 'database' ? (
                  <DatabaseNameEditor path={fieldPath} value={current} onSet={onSet} />
                ) : field.type === 'array' ? (
                  <ArrayEditor
                    path={fieldPath}
                    value={Array.isArray(current) ? current : []}
                    onDelete={onDelete}
                    onSet={onSet}
                  />
                ) : field.type === 'object' ? (
                  <ObjectFields
                    path={fieldPath}
                    value={current}
                    onDelete={onDelete}
                    onSet={onSet}
                  />
                ) : field.options && field.options.length > 0 ? (
                  <Select
                    className="w-full"
                    optionList={optionList(withCurrentValue(field.options, displayValue(value)), field.option_labels)}
                    value={displayValue(value)}
                    onChange={next => onSet(fieldPath, String(next))}
                  />
                ) : field.suggestions && field.suggestions.length > 0 ? (
                  // 既能下拉选常用值，也允许直接输入，适合 every / at 这类字段。
                  <AutoComplete
                    className="w-full"
                    data={field.suggestions}
                    placeholder="可从下拉里选，也可以直接填写"
                    showClear
                    value={displayValue(value)}
                    onChange={next => onSet(fieldPath, next)}
                  />
                ) : (
                  <ScalarEditor
                    keyName={field.key}
                    path={fieldPath}
                    value={value}
                    valueType={field.type}
                    onSet={onSet}
                  />
                )}
                {field.description && !(field.table_selector && probe?.kind === 'database') ? (
                  <div className="mt-1 text-[11px] leading-4 text-muted-foreground/70">
                    {field.description}
                  </div>
                ) : null}
              </div>
            )
          })}
      </div>
      {Object.keys(unknown).length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">其它字段</div>
          <ObjectFields
            path={path}
            value={unknown}
            onDelete={onDelete}
            onSet={onSet}
          />
        </div>
      ) : null}
    </div>
  )
}

function hasContent(value: ConfigEditorValue | undefined) {
  const object = valuesAsObject(value)
  return !isMaskedValue(value) && Object.keys(object).length > 0
}

// 可选功能块。以前无论 YAML 里有没有配置，压缩/加密/分片/归档都会把全部字段
// 铺成一堆空输入框；现在未配置时只留一行「未配置 + 启用」。
function OptionalSection({
  label,
  hint,
  path,
  value,
  fields,
  defaults,
  onDelete,
  onSet
}: {
  label: string
  hint: string
  path: string
  value: ConfigEditorValue | undefined
  fields: ConfigEditorField[]
  defaults: ConfigObject
  onDelete: (path: string) => void
  onSet: (path: string, value: ConfigEditorValue) => void
}) {
  if (!hasContent(value)) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-4 py-3">
        <span className="text-sm font-medium">{label}</span>
        <Tag color="grey" size="small">
          未配置
        </Tag>
        <span className="text-xs text-muted-foreground">{hint}</span>
        <Button
          className="ml-auto"
          icon={<Plus className="size-4" />}
          size="small"
          theme="light"
          type="tertiary"
          onClick={() => onSet(path, defaults)}
        >
          启用
        </Button>
      </div>
    )
  }

  return (
    <Card
      className="bg-background-deep"
      headerExtraContent={
        <Button
          aria-label={`停用${label}`}
          size="small"
          theme="borderless"
          type="danger"
          onClick={() => onDelete(path)}
        >
          停用
        </Button>
      }
      shadows="always"
      title={label}
    >
      <SchemaObjectFields
        fields={fields}
        path={path}
        value={value}
        onDelete={onDelete}
        onSet={onSet}
      />
    </Card>
  )
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replaceAll('-', '_')
  return [
    'password',
    'passphrase',
    'secret',
    'token',
    'access_key',
    'private_key',
    'api_key',
    'auth_key',
    'credential'
  ].some(part => normalized.includes(part))
}

function ProviderCollection({
  label,
  path,
  value,
  schema,
  addHint,
  kind,
  modelName,
  onDelete,
  onSet
}: {
  label: string
  path: string
  value: ConfigEditorValue | undefined
  schema: Record<string, ConfigEditorField[]>
  addHint: string
  /** 数据库 / 存储支持测试连接；通知等其它集合不传。 */
  kind?: ProbeKind
  modelName: string
  onDelete: (path: string) => void
  onSet: (path: string, value: ConfigEditorValue) => void
}) {
  const nodes = valuesAsObject(value)
  const providerTypes = Object.keys(schema)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState(providerTypes[0] ?? '')
  const [probeResults, setProbeResults] = useState<Record<string, ConfigProbeResponse>>({})
  const typeLabels = schemaTypeLabels(schema)

  function addProvider() {
    const name = newName.trim()
    if (!name || !newType || nodes[name]) return
    onSet(
      toConfigPointer(...pointerSegments(path), name),
      { type: newType } as ConfigEditorValue
    )
    setNewName('')
  }

  return (
    <Card
      className="config-editor-provider-card"
      headerExtraContent={<Tag color="blue">{Object.keys(nodes).length}</Tag>}
      shadows="hover"
      title={label}
    >
      <div className="grid gap-4">
        {Object.keys(nodes).length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {addHint}
          </div>
        ) : null}
        {Object.entries(nodes).map(([name, node]) => {
          const nodePath = toConfigPointer(...pointerSegments(path), name)
          const nodeObject = valuesAsObject(node)
          const type = typeof nodeObject.type === 'string' ? nodeObject.type : ''
          const effectiveType = type || (providerTypes.includes(name) ? name : '')
          const types = Array.from(new Set([...providerTypes, ...(effectiveType ? [effectiveType] : [])]))
          const probe: ProbeContext | undefined = kind
            ? { kind, modelName, path: nodePath, type: effectiveType, value: nodeObject }
            : undefined
          const probeResult = probeResults[nodePath]
          return (
            <Card
              className="bg-background-deep"
              headerExtraContent={
                <div className="flex items-center gap-1">
                  {probe ? (
                    <ConnectionProbeButton
                      probe={probe}
                      onResult={response =>
                        setProbeResults(current => ({ ...current, [nodePath]: response }))
                      }
                    />
                  ) : null}
                  <Button
                    aria-label={`删除${label}${name}`}
                    icon={<Trash2 className="size-4" />}
                    size="small"
                    theme="borderless"
                    type="danger"
                    onClick={() => onDelete(nodePath)}
                  />
                </div>
              }
              key={nodePath}
              shadows="always"
              title={name}
            >
              <div className="grid gap-3">
                {probeResult ? (
                  <div className="space-y-2">
                    <div
                      className={
                        probeResult.ok
                          ? 'rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs break-all text-success'
                          : 'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs break-all text-destructive'
                      }
                      role="status"
                    >
                      {probeResult.message}
                      {probeResult.databases?.length && probe?.kind !== 'database' ? (
                        <div className="mt-1 text-muted-foreground">
                          可选数据库：{probeResult.databases.join('、')}
                        </div>
                      ) : null}
                    </div>

                    {probeResult.dump_tool && !probeResult.dump_tool_found ? (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                          <span>注意：宿主机未检测到 [{probeResult.dump_tool}] 转储工具</span>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          连接测试已通过，但实际定时任务或手动执行备份时必须依赖该工具导出数据。
                        </div>
                        {probeResult.dump_tool_command ? (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded bg-background/90 p-2 border border-border/50">
                            <code className="font-mono text-[11px] text-foreground select-all break-all">
                              {probeResult.dump_tool_command}
                            </code>
                            <Button
                              icon={<Copy className="size-3" />}
                              onClick={() => {
                                navigator.clipboard.writeText(probeResult.dump_tool_command || '')
                                Toast.success('已复制安装命令')
                              }}
                              size="small"
                              theme="light"
                              type="warning"
                            >
                              复制安装命令
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">类型</div>
                  {types.length > 0 ? (
                    <Select
                      className="w-full"
                      optionList={optionList(types, typeLabels)}
                      value={effectiveType}
                      onChange={next => onSet(toConfigPointer(...pointerSegments(nodePath), 'type'), String(next))}
                    />
                  ) : (
                    <Input
                      value={type}
                      onChange={next => onSet(toConfigPointer(...pointerSegments(nodePath), 'type'), next)}
                    />
                  )}
                </div>
                {/*
                  数据库节点包一层 Provider：库列表 / 表列表在「数据库名」「指定的表」
                  「排除的表」之间共享，避免同一个库被反复连接。
                */}
                {probe?.kind === 'database' ? (
                  <DatabaseProbeProvider onSet={onSet} probe={probe}>
                    <SchemaObjectFields
                      fields={schema[effectiveType] ?? []}
                      hideType
                      path={nodePath}
                      probe={probe}
                      value={node}
                      onDelete={onDelete}
                      onSet={onSet}
                    />
                  </DatabaseProbeProvider>
                ) : (
                  <SchemaObjectFields
                    fields={schema[effectiveType] ?? []}
                    hideType
                    path={nodePath}
                    probe={probe}
                    value={node}
                    onDelete={onDelete}
                    onSet={onSet}
                  />
                )}
              </div>
            </Card>
          )
        })}
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center">
          <Input
            aria-label={`新增${label}名称`}
            className="sm:flex-1"
            placeholder={`${label}名称`}
            value={newName}
            onChange={setNewName}
          />
          {providerTypes.length > 0 ? (
            <Select
              aria-label={`${label}类型`}
              className="sm:w-44"
              optionList={optionList(providerTypes, typeLabels)}
              value={newType}
              onChange={next => setNewType(String(next))}
            />
          ) : null}
          <Button icon={<Plus className="size-4" />} theme="light" type="primary" onClick={addProvider}>
            新增
          </Button>
        </div>
      </div>
    </Card>
  )
}

type ModelCategory = 'all' | 'schedule' | 'databases' | 'storages' | 'archive' | 'notifiers'

export function getModelDatabaseSummary(modelObj: ConfigObject) {
  const dbs = valuesAsObject(modelObj.databases)
  const entries = Object.entries(dbs)
  if (entries.length === 0) {
    return {
      type: 'unknown',
      icon: '/icons/database/mysql.svg',
      engineName: '未配置库',
      endpoint: '',
      hasDb: false
    }
  }
  const [dbName, dbVal] = entries[0]
  const dbObj = valuesAsObject(dbVal)
  const type = String(dbObj.type || '').toLowerCase()
  const host = String(dbObj.host || '')
  const port = dbObj.port ? `:${dbObj.port}` : ''
  const dbTarget = String(dbObj.database || dbName || '')

  let endpoint = ''
  if (host) {
    endpoint = `${host}${port}${dbTarget ? ` / ${dbTarget}` : ''}`
  } else if (dbTarget) {
    endpoint = dbTarget
  }

  return {
    type,
    icon: getDatabaseIcon(type),
    engineName: getDatabaseEngineName(type),
    endpoint,
    hasDb: true
  }
}

/**
 * 判定模型的计划任务是否生效：
 * 1. 如果显式配置了 enabled，以 enabled 为准；
 * 2. 如果未显式配置 enabled（如从 YAML 直接读取的历史配置），按 GoBackup 规则：只要包含 cron 或 every，默认判定为启用。
 */
export function isModelScheduleActive(scheduleVal: ConfigEditorValue | undefined): boolean {
  if (!scheduleVal || typeof scheduleVal !== 'object') return false
  const schedule = scheduleVal as Record<string, unknown>
  if (typeof schedule.enabled === 'boolean') {
    return schedule.enabled
  }
  if (schedule.enabled === 'true') return true
  if (schedule.enabled === 'false') return false

  const hasCron = typeof schedule.cron === 'string' && schedule.cron.trim().length > 0
  const hasEvery = typeof schedule.every === 'string' && schedule.every.trim().length > 0
  return hasCron || hasEvery
}

function ModelEditor({
  name,
  path,
  value,
  schema,
  activeCategory = 'databases',
  onCategoryChange,
  onDelete,
  onSet
}: {
  name: string
  path: string
  value: ConfigEditorValue
  schema: ConfigEditorSchema
  activeCategory?: ModelCategory
  onCategoryChange?: (category: ModelCategory) => void
  onDelete: (path: string) => void
  onSet: (path: string, value: ConfigEditorValue) => void
}) {
  const modelSectionKeys = [
    'databases',
    'storages',
    'notifiers',
    'schedule',
    'compress_with',
    'encrypt_with',
    'archive',
    'split_with'
  ]
  const modelFields = Object.fromEntries(
    Object.entries(valuesAsObject(value)).filter(([key]) => !modelSectionKeys.includes(key))
  )
  const model = valuesAsObject(value)
  const sectionPath = (key: string) => toConfigPointer(...pointerSegments(path), key)

  const dbsCount = Object.keys(valuesAsObject(model.databases)).length
  const storagesCount = Object.keys(valuesAsObject(model.storages)).length
  const notifiersCount = Object.keys(valuesAsObject(model.notifiers)).length
  const schedule = valuesAsObject(model.schedule)
  const isScheduled = isModelScheduleActive(schedule)
  const dbSummary = getModelDatabaseSummary(model)

  const categories: { key: ModelCategory; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'databases', label: '数据库连接', icon: <Database className="size-3.5" />, badge: dbsCount },
    { key: 'schedule', label: '计划任务', icon: <CalendarClock className="size-3.5" /> },
    { key: 'storages', label: '存储目标', icon: <HardDrive className="size-3.5" />, badge: storagesCount },
    { key: 'archive', label: '归档与压缩', icon: <FileArchive className="size-3.5" /> },
    { key: 'notifiers', label: '通知告警', icon: <Bell className="size-3.5" />, badge: notifiersCount },
    { key: 'all', label: '完整概览', icon: <Layers className="size-3.5" /> }
  ]

  return (
    <Card
      className="config-editor-model-card shadow-xs"
      headerExtraContent={
        <div className="flex items-center gap-2">
          <Tag color={isScheduled ? 'green' : 'grey'} className="w-fit">
            {isScheduled ? '计划已启用' : '仅手动触发'}
          </Tag>
          <Popconfirm
            content={`确定要删除连接「${name}」吗？删除后需要点击右上角「保存并重载」生效。`}
            onConfirm={() => onDelete(path)}
            title="删除连接确认"
          >
            <Button
              aria-label={`删除模型 ${name}`}
              icon={<Trash2 className="size-4" />}
              size="small"
              theme="borderless"
              type="danger"
            >
              删除连接
            </Button>
          </Popconfirm>
        </div>
      }
      shadows="hover"
      title={
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-muted/60 border flex items-center justify-center shrink-0 p-1.5 shadow-xs">
            <img
              src={dbSummary.icon}
              alt={dbSummary.engineName}
              className="size-7 object-contain drop-shadow-xs"
              onError={e => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg uppercase tracking-wide">{name}</span>
              <Tag color="blue" size="small" className="w-fit">{dbSummary.engineName}</Tag>
            </div>
            {dbSummary.endpoint ? (
              <div className="text-xs text-muted-foreground font-normal">
                {dbSummary.endpoint}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground font-normal">
                {String(model.description || '数据库连接与备份策略')}
              </div>
            )}
          </div>
        </div>
      }
    >
      <div className="grid gap-5">
        {/* 快捷分类导航胶囊 */}
        <div className="flex flex-wrap items-center gap-1.5 border-b pb-3 text-xs">
          {categories.map(cat => {
            const isActive = activeCategory === cat.key
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onCategoryChange?.(cat.key)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
                {cat.badge !== undefined && cat.badge > 0 ? (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {cat.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {/* 基础信息与计划 */}
        {(activeCategory === 'all' || activeCategory === 'schedule') && (
          <>
            <SchemaObjectFields
              fields={schema.model}
              path={path}
              value={modelFields}
              onDelete={onDelete}
              onSet={onSet}
            />

            <OptionalSection
              defaults={{ enabled: true }}
              fields={schema.sections.schedule ?? []}
              hint="留空表示不自动备份，只能手动执行"
              label="计划任务"
              path={sectionPath('schedule')}
              value={model.schedule}
              onDelete={onDelete}
              onSet={onSet}
            />
          </>
        )}

        {/* 数据库 */}
        {(activeCategory === 'all' || activeCategory === 'databases') && (
          <ProviderCollection
            addHint="还没有配置数据源。填一个名字并选择类型，就能开始备份数据库。"
            kind="database"
            label="数据库"
            modelName={name}
            path={sectionPath('databases')}
            schema={schema.databases}
            value={model.databases}
            onDelete={onDelete}
            onSet={onSet}
          />
        )}

        {/* 存储 */}
        {(activeCategory === 'all' || activeCategory === 'storages') && (
          <ProviderCollection
            addHint="还没有配置存储位置。备份文件必须至少有一个存放点。"
            kind="storage"
            label="存储"
            modelName={name}
            path={sectionPath('storages')}
            schema={schema.storages}
            value={model.storages}
            onDelete={onDelete}
            onSet={onSet}
          />
        )}

        {/* 通知 */}
        {(activeCategory === 'all' || activeCategory === 'notifiers') && (
          <ProviderCollection
            addHint="还没有配置通知。配置后备份成功或失败会主动推送到你的群或邮箱。"
            label="通知"
            modelName={name}
            path={sectionPath('notifiers')}
            schema={schema.notifiers}
            value={model.notifiers}
            onDelete={onDelete}
            onSet={onSet}
          />
        )}

        {/* 归档 / 压缩 / 加密 / 分片 */}
        {(activeCategory === 'all' || activeCategory === 'archive') && (
          <PageSection
            description="没有配置的项不会参与备份，点「启用」即可展开填写。"
            title="压缩 / 加密 / 分片 / 归档"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <OptionalSection
                defaults={{ type: 'tgz' }}
                fields={schema.sections.compress_with ?? []}
                hint="不压缩时备份文件是原始 dump，通常很大"
                label="压缩"
                path={sectionPath('compress_with')}
                value={model.compress_with}
                onDelete={onDelete}
                onSet={onSet}
              />
              <OptionalSection
                defaults={{ type: 'openssl' }}
                fields={schema.sections.encrypt_with ?? []}
                hint="不加密时备份文件以明文存放"
                label="加密"
                path={sectionPath('encrypt_with')}
                value={model.encrypt_with}
                onDelete={onDelete}
                onSet={onSet}
              />
              <OptionalSection
                defaults={{ chunk_size: '1GB' }}
                fields={schema.sections.split_with ?? []}
                hint="不分片时无论多大都只生成一个文件"
                label="分片"
                path={sectionPath('split_with')}
                value={model.split_with}
                onDelete={onDelete}
                onSet={onSet}
              />
              <div className="lg:col-span-2">
                <OptionalSection
                  defaults={{ includes: [] }}
                  fields={schema.sections.archive ?? []}
                  hint="不归档时只备份数据库，不打包服务器上的文件"
                  label="归档"
                  path={sectionPath('archive')}
                  value={model.archive}
                  onDelete={onDelete}
                  onSet={onSet}
                />
              </div>
            </div>
          </PageSection>
        )}
      </div>
    </Card>
  )
}

function ScheduleMatrixView({
  models,
  onEditModel,
  onToggleSchedule
}: {
  models: Record<string, ConfigEditorValue>
  onEditModel: (name: string, category?: ModelCategory) => void
  onToggleSchedule: (name: string, enabled: boolean) => void
}) {
  const [keyword, setKeyword] = useState('')

  const entries = useMemo(() => {
    return Object.entries(models).map(([name, val]) => {
      const model = valuesAsObject(val)
      const schedule = valuesAsObject(model.schedule)
      const databases = Object.entries(valuesAsObject(model.databases)).map(([dbName, dbVal]) => {
        const dbObj = valuesAsObject(dbVal)
        return { name: dbName, type: typeof dbObj.type === 'string' ? dbObj.type : '' }
      })
      const storages = Object.entries(valuesAsObject(model.storages)).map(([stName, stVal]) => {
        const stObj = valuesAsObject(stVal)
        return { name: stName, type: typeof stObj.type === 'string' ? stObj.type : '' }
      })
      const isEnabled = isModelScheduleActive(schedule)
      const cron = typeof schedule.cron === 'string' ? schedule.cron : ''
      const every = typeof schedule.every === 'string' ? schedule.every : ''
      const at = typeof schedule.at === 'string' ? schedule.at : ''
      const description = typeof model.description === 'string' ? model.description : ''

      return {
        at,
        cron,
        databases,
        description,
        every,
        isEnabled,
        name,
        rawSchedule: schedule,
        storages
      }
    })
  }, [models])

  const filtered = useMemo(() => {
    if (!keyword.trim()) return entries
    const needle = keyword.trim().toLowerCase()
    return entries.filter(item => {
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.databases.some(db => db.name.toLowerCase().includes(needle) || db.type.toLowerCase().includes(needle))
      )
    })
  }, [entries, keyword])

  const scheduledCount = entries.filter(item => item.isEnabled).length

  return (
    <div className="grid gap-4">
      {/* 顶部统计条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            <span className="font-semibold text-base">计划调度总览</span>
          </div>
          <div className="text-muted-foreground text-xs">
            总计 <strong>{entries.length}</strong> 个模型 · 自动计划 <strong>{scheduledCount}</strong> 个 · 仅手动 <strong>{entries.length - scheduledCount}</strong> 个
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-48 sm:w-60"
            placeholder="搜索模型或数据源..."
            prefix={<Search className="size-4 text-muted-foreground" />}
            showClear
            value={keyword}
            onChange={setKeyword}
          />
        </div>
      </div>

      {/* 计划调度矩阵表格 */}
      <Card shadows="hover">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">模型名称</th>
                <th className="px-4 py-3">计划状态</th>
                <th className="px-4 py-3">调度规则 (Cron / Every / At)</th>
                <th className="px-4 py-3">关联数据源</th>
                <th className="px-4 py-3">备份存储</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                    未找到匹配的模型计划
                  </td>
                </tr>
              ) : (
                filtered.map(item => {
                  return (
                    <tr key={item.name} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold uppercase tracking-wide">{item.name}</div>
                        {item.description ? (
                          <div className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{item.description}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={item.isEnabled}
                            onChange={checked => onToggleSchedule(item.name, checked)}
                            size="small"
                          />
                          <Tag color={item.isEnabled ? 'green' : 'grey'} size="small" className="w-fit">
                            {item.isEnabled ? '已启用' : '已停用'}
                          </Tag>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {item.cron ? (
                          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                            cron: {item.cron}
                          </code>
                        ) : item.every ? (
                          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                            every: {item.every}
                          </code>
                        ) : item.at ? (
                          <span className="text-xs text-muted-foreground font-mono">
                            at: {item.at}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">未配置（仅手动触发）</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.databases.length === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {item.databases.map(db => (
                              <Tag key={db.name} color="blue" size="small" className="w-fit">
                                {db.type}:{db.name}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {item.storages.length === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {item.storages.map(st => (
                              <Tag key={st.name} color="violet" size="small" className="w-fit">
                                {st.type}:{st.name}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="small"
                            theme="light"
                            type="primary"
                            onClick={() => onEditModel(item.name, 'schedule')}
                          >
                            调整计划
                          </Button>
                          <Button
                            size="small"
                            theme="borderless"
                            type="tertiary"
                            onClick={() => onEditModel(item.name, 'all')}
                          >
                            模型详情
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function ConfigEditorStudioSkeleton() {
  return (
    <Page
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            disabled
            icon={<RefreshCw className="size-4 animate-spin text-muted-foreground" />}
            theme="light"
            type="tertiary"
          >
            读取中...
          </Button>
          <Button
            disabled
            icon={<Save className="size-4" />}
            theme="solid"
            type="primary"
          >
            保存并重载
          </Button>
        </div>
      }
      description="通过结构化工作台管理 GoBackup 的基础设置、计划调度、数据库、存储、压缩与通知配置。"
      title="配置管理"
    >
      <div className="grid gap-5 animate-pulse">
        {/* 顶部视角切换器骨架 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-primary/20 px-3.5 py-2 text-sm font-medium">
              <Database className="size-4 text-primary/70" />
              <div className="h-4 w-24 rounded bg-primary/30" />
              <div className="h-4 w-6 rounded-full bg-primary/40" />
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3.5 py-2 text-sm font-medium">
              <CalendarClock className="size-4 text-muted-foreground/60" />
              <div className="h-4 w-20 rounded bg-muted/80" />
              <div className="h-4 w-6 rounded-full bg-muted/50" />
            </div>
          </div>
          <div className="h-3 w-48 rounded bg-muted/50 hidden sm:block" />
        </div>

        {/* 左右分栏工作台骨架 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* 左侧 Master List 骨架 */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
            {/* 搜索框骨架 */}
            <div className="h-9 w-full rounded-lg bg-muted/50 border border-border/40 flex items-center px-3 gap-2">
              <Search className="size-4 text-muted-foreground/40" />
              <div className="h-3.5 w-28 rounded bg-muted/60" />
            </div>

            {/* 系统设置卡片骨架 */}
            <div className="rounded-lg border bg-card p-3 shadow-xs space-y-2">
              <div className="h-3 w-16 rounded bg-muted/60 uppercase" />
              <div className="flex items-center justify-between rounded-md p-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Settings className="size-4 text-muted-foreground/50" />
                  <div className="space-y-1">
                    <div className="h-3.5 w-20 rounded bg-muted/70" />
                    <div className="h-2.5 w-24 rounded bg-muted/40" />
                  </div>
                </div>
              </div>
            </div>

            {/* 数据库连接列表骨架 */}
            <div className="rounded-lg border bg-card p-3 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-20 rounded bg-muted/70 uppercase" />
                  <div className="h-4 w-6 rounded bg-muted/50" />
                </div>
                <div className="h-6 w-16 rounded bg-primary/20" />
              </div>

              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg p-2.5 border ${
                      i === 1 ? 'bg-primary/10 border-primary/20' : 'bg-muted/20 border-border/30'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                      <div className="size-8 rounded-md bg-muted/80 shrink-0" />
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="h-3.5 w-16 rounded bg-muted/80" />
                          <div className="h-3 w-10 rounded bg-muted/50" />
                        </div>
                        <div className="h-2.5 w-24 rounded bg-muted/40" />
                      </div>
                    </div>
                    <div className="h-4 w-10 rounded bg-muted/50 shrink-0" />
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t">
                <div className="h-8 w-full rounded bg-muted/30 border border-dashed border-border/60" />
              </div>
            </div>
          </div>

          {/* 右侧 Detail Editor 骨架 */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5">
            {/* 卡片 1: 顶部模型与分类选项卡骨架 */}
            <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
              <div className="flex items-start justify-between pb-3 border-b">
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Database className="size-6 text-primary/40" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-28 rounded bg-muted/90" />
                      <div className="h-4 w-14 rounded bg-muted/60" />
                      <div className="h-4 w-12 rounded bg-success/20" />
                    </div>
                    <div className="h-3 w-48 rounded bg-muted/50" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-20 rounded bg-muted/40" />
                  <div className="h-8 w-8 rounded bg-muted/40" />
                </div>
              </div>

              {/* 细分子分类标签栏 */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className={`h-7 rounded-md ${i === 1 ? 'w-20 bg-primary/20' : 'w-24 bg-muted/50'}`}
                  />
                ))}
              </div>
            </div>

            {/* 卡片 2: 表单字段骨架 */}
            <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="h-4 w-28 rounded bg-muted/80" />
                <div className="h-5 w-16 rounded bg-muted/40" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <div className="h-3 w-16 rounded bg-muted/60" />
                  <div className="h-9 w-full rounded-md bg-muted/40 border border-border/40" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-14 rounded bg-muted/60" />
                  <div className="h-9 w-full rounded-md bg-muted/40 border border-border/40" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-20 rounded bg-muted/60" />
                  <div className="h-9 w-full rounded-md bg-muted/40 border border-border/40" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-16 rounded bg-muted/60" />
                  <div className="h-9 w-full rounded-md bg-muted/40 border border-border/40" />
                </div>
              </div>
            </div>

            {/* 卡片 3: 存储与计划骨架 */}
            <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="h-4 w-32 rounded bg-muted/80" />
                <div className="h-5 w-20 rounded bg-muted/40" />
              </div>
              <div className="space-y-3 pt-1">
                <div className="h-14 rounded-lg bg-muted/30 border border-border/40 p-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="h-3.5 w-24 rounded bg-muted/70" />
                    <div className="h-2.5 w-40 rounded bg-muted/40" />
                  </div>
                  <div className="h-5 w-10 rounded-full bg-muted/60" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  )
}

export default function ConfigEditorPage() {
  const query = useQuery({
    queryFn: ({ signal }) => configEditorApi.get(signal),
    queryKey: ['gobackup', 'config-editor'],
    staleTime: 30_000,
    gcTime: 5 * 60_000
  })
  const [draft, setDraft] = useState<ConfigObject | undefined>(() => query.data?.config)
  const [schema, setSchema] = useState<ConfigEditorSchema | undefined>(() => query.data?.schema)
  const [version, setVersion] = useState<string>(() => query.data?.version ?? '')
  const [operations, setOperations] = useState<ConfigEditorOperation[]>([])
  const [summaryVisible, setSummaryVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [isNewConnectionModalOpen, setIsNewConnectionModalOpen] = useState(false)

  // 视角切换：'models' (数据库连接管理) vs 'schedules' (计划调度总览)
  const [viewMode, setViewMode] = useState<'models' | 'schedules'>('models')
  // 当前选中的条目：'__web__' 或 模型/连接名称
  const [selectedKey, setSelectedKey] = useState<string>('')
  // 当前模型详情分类：'databases' (优先数据库连接) | 'schedule' | 'storages' | 'archive' | 'notifiers' | 'all'
  const [activeCategory, setActiveCategory] = useState<ModelCategory>('databases')
  // 连接搜索关键字
  const [modelSearch, setModelSearch] = useState('')

  useEffect(() => {
    if (!query.data) return
    if (!draft || operations.length === 0) {
      setDraft(query.data.config)
      setSchema(query.data.schema)
      setVersion(query.data.version)
      setOperations([])
    }
  }, [query.data])

  const models = useMemo(() => valuesAsObject(draft?.models), [draft?.models])
  const modelKeys = useMemo(() => Object.keys(models), [models])

  // 确保选中的 key 有效（默认选中第一个模型；没有模型时选中 __web__）
  const activeKey = useMemo(() => {
    if (selectedKey === '__web__') return '__web__'
    if (selectedKey === '__global_other__') return '__global_other__'
    if (selectedKey && models[selectedKey]) return selectedKey
    return modelKeys[0] || '__web__'
  }, [selectedKey, models, modelKeys])

  const operationSummary = useMemo(() => summarizeConfigOperations(operations), [operations])
  const readableSummary = useMemo(() => describeConfigOperations(operations), [operations])

  // 计算未保存修改的状态
  const unsavedPaths = useMemo(() => new Set(operations.map(op => op.path)), [operations])

  function hasModelUnsaved(name: string) {
    const prefix = `/models/${name}`
    for (const p of unsavedPaths) {
      if (p === prefix || p.startsWith(`${prefix}/`)) return true
    }
    return false
  }

  const hasWebUnsaved = useMemo(() => {
    for (const p of unsavedPaths) {
      if (p === '/web' || p.startsWith('/web/')) return true
    }
    return false
  }, [unsavedPaths])

  const hasGlobalOtherUnsaved = useMemo(() => {
    for (const p of unsavedPaths) {
      if (p !== '/web' && !p.startsWith('/web/') && !p.startsWith('/models/')) return true
    }
    return false
  }, [unsavedPaths])

  function updateValue(path: string, value: ConfigEditorValue) {
    setDraft(current => setAtPath(current ?? emptyObject, path, value))
    setOperations(current => addOperation(current, createSetOperation(path, value)))
  }

  function deleteValue(path: string) {
    setDraft(current => deleteAtPath(current ?? emptyObject, path))
    setOperations(current => addOperation(current, createDeleteOperation(path)))
  }

  function discardChanges() {
    setDraft(query.data?.config)
    setOperations([])
    Toast.info('已放弃本次修改')
  }

  async function reloadLatest() {
    try {
      const latest = await configEditorApi.get()
      setDraft(latest.config)
      setSchema(latest.schema)
      setVersion(latest.version)
      setOperations([])
      Toast.success('已读取最新配置')
    } catch (error) {
      Toast.error(errorMessage(error, '读取配置失败'))
    }
  }

  async function saveChanges() {
    if (!version || operations.length === 0) return
    setSaving(true)
    try {
      await configEditorApi.validate(version, operations)
      const response = await configEditorApi.patch(version, operations)
      if (response.config) setDraft(response.config)
      setVersion(response.version)
      setOperations([])
      setSummaryVisible(false)
      Toast.success('配置已保存并重新加载')
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        Toast.error('配置已被其他页面修改，请重新读取最新配置')
      } else {
        Toast.error(errorMessage(error, '配置校验或保存失败'))
      }
    } finally {
      setSaving(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operations.length > 0) setSummaryVisible(true)
  }

  function addModel() {
    const name = newModelName.trim()
    if (!name || models[name]) return
    updateValue(toConfigPointer('models', name), {
      archive: { includes: [] },
      storages: { local: { path: './backups', type: 'local' } }
    })
    setNewModelName('')
    setSelectedKey(name)
    setViewMode('models')
    setActiveCategory('all')
  }

  function toggleScheduleEnabled(modelName: string, enabled: boolean) {
    const model = valuesAsObject(models[modelName])
    const currentSchedule = valuesAsObject(model.schedule)
    const nextSchedule = {
      ...currentSchedule,
      enabled
    }
    updateValue(toConfigPointer('models', modelName, 'schedule'), nextSchedule as ConfigEditorValue)
  }

  function openModelInStudio(modelName: string, category: ModelCategory = 'databases') {
    setSelectedKey(modelName)
    setActiveCategory(category)
    setViewMode('models')
  }

  function handleCreateConnection(name: string, engine: DatabaseEngineDef) {
    const newModel: ConfigObject = {
      description: `${engine.name} 数据库备份`,
      schedule: { enabled: true, every: '1day', at: '03:00' },
      compress_with: { type: 'tgz' },
      storages: {
        local: { type: 'local', keep: 14, path: `backups/${name}` }
      },
      databases: {
        [name]: {
          type: engine.type,
          host: '127.0.0.1',
          port: engine.defaultPort || 3306,
          database: name,
          username: 'root'
        }
      }
    }
    updateValue(toConfigPointer('models', name), newModel)
    setSelectedKey(name)
    setActiveCategory('databases')
    setViewMode('models')
    Toast.success(`已创建 ${engine.name} 连接「${name}」`)
  }

  if (query.isLoading && !draft) {
    return <ConfigEditorStudioSkeleton />
  }

  if (query.isError || !draft || !schema) {
    return (
      <Page
        actions={<Button icon={<RefreshCw className="size-4" />} onClick={() => void query.refetch()}>重试</Button>}
        description="无法读取配置文件，请检查 GoBackup 运行状态。"
        title="配置管理"
      >
        <Card><div className="py-8 text-center text-sm text-destructive">读取配置失败</div></Card>
      </Page>
    )
  }

  const webConfig = draft.web
  const globalOther = Object.fromEntries(Object.entries(draft).filter(([key]) => !['web', 'models'].includes(key)))

  const filteredModelKeys = modelKeys.filter(k => {
    if (!modelSearch.trim()) return true
    const needle = modelSearch.trim().toLowerCase()
    const desc = String(valuesAsObject(models[k]).description || '').toLowerCase()
    return k.toLowerCase().includes(needle) || desc.includes(needle)
  })

  const scheduledCount = modelKeys.filter(k => {
    const s = valuesAsObject(valuesAsObject(models[k]).schedule)
    return isModelScheduleActive(s)
  }).length

  return (
    <Page
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<RefreshCw className="size-4" />}
            loading={query.isFetching}
            theme="light"
            type="tertiary"
            onClick={() => void reloadLatest()}
          >
            重新读取
          </Button>
          <Button
            data-testid="config-save"
            disabled={operations.length === 0}
            icon={<Save className="size-4" />}
            loading={saving}
            theme="solid"
            type="primary"
            onClick={() => {
              if (operations.length > 0) setSummaryVisible(true)
            }}
          >
            保存并重载{operations.length > 0 ? `（${operations.length}）` : ''}
          </Button>
        </div>
      }
      description="通过结构化工作台管理 GoBackup 的基础设置、计划调度、数据库、存储、压缩与通知配置。"
      title="配置管理"
    >
      <form data-testid="config-editor-page" onSubmit={submit}>
        <div className="grid gap-5">
          {/* 未保存修改浮条 */}
          {operations.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
              <Tag color="blue">{operations.length} 项未保存</Tag>
              <span className="text-xs text-muted-foreground">
                修改目前只在前端草稿中，点击「保存并重载」才会校验并安全写入 gobackup.yml。
              </span>
              <Button
                className="ml-auto"
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={discardChanges}
              >
                放弃修改
              </Button>
            </div>
          ) : null}

          {/* 顶部视角切换器：数据库连接管理 vs 计划调度总览 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('models')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  viewMode === 'models'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Database className="size-4" />
                <span>数据库连接管理</span>
                <Tag color={viewMode === 'models' ? 'white' : 'blue'} size="small" className="w-fit">
                  {modelKeys.length}
                </Tag>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('schedules')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  viewMode === 'schedules'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <CalendarClock className="size-4" />
                <span>计划调度总览</span>
                <Tag color={viewMode === 'schedules' ? 'white' : scheduledCount > 0 ? 'green' : 'grey'} size="small" className="w-fit">
                  {scheduledCount}
                </Tag>
              </button>
            </div>
            <div className="text-xs text-muted-foreground hidden sm:block">
              {viewMode === 'schedules' ? '全局聚合查看与快捷开关所有定时调度计划' : '按数据库连接管理备份策略、存储目标与告警'}
            </div>
          </div>

          {/* 视角一：计划调度总览 */}
          {viewMode === 'schedules' ? (
            <ScheduleMatrixView
              models={models}
              onEditModel={openModelInStudio}
              onToggleSchedule={toggleScheduleEnabled}
            />
          ) : (
            /* 视角二：数据库连接与配置工作台（左右分栏） */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* 左侧侧边导航栏 (Master List) */}
              <div className="lg:col-span-4 xl:col-span-3 space-y-4">
                {/* 搜索框 */}
                <Input
                  placeholder="搜索数据库连接..."
                  prefix={<Search className="size-4 text-muted-foreground" />}
                  showClear
                  value={modelSearch}
                  onChange={setModelSearch}
                />

                {/* 全局设置条目 */}
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    系统设置
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedKey('__web__')}
                    className={`w-full flex items-center justify-between rounded-md p-2 text-left text-sm transition-colors ${
                      activeKey === '__web__'
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Settings className="size-4 shrink-0 text-muted-foreground" />
                      <div className="truncate">
                        <div className="font-medium leading-tight">Web 基础设置</div>
                        <div className="text-[11px] text-muted-foreground leading-tight">端口、密码及鉴权</div>
                      </div>
                    </div>
                    {hasWebUnsaved ? <Tag color="blue" size="small" className="w-fit">未保存</Tag> : null}
                  </button>

                  {Object.keys(globalOther).length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedKey('__global_other__')}
                      className={`w-full mt-1 flex items-center justify-between rounded-md p-2 text-left text-sm transition-colors ${
                        activeKey === '__global_other__'
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <div className="truncate font-medium leading-tight">其它全局配置</div>
                      {hasGlobalOtherUnsaved ? <Tag color="blue" size="small" className="w-fit">未保存</Tag> : null}
                    </button>
                  ) : null}
                </div>

                {/* 数据库连接列表 */}
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        数据库连接
                      </span>
                      <Tag color="blue" size="small" className="w-fit">{modelKeys.length}</Tag>
                    </div>
                    <Button
                      icon={<Plus className="size-3.5" />}
                      size="small"
                      theme="solid"
                      type="primary"
                      onClick={() => setIsNewConnectionModalOpen(true)}
                    >
                      新建连接
                    </Button>
                  </div>

                  <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                    {filteredModelKeys.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        {modelSearch ? '未匹配到连接' : '暂无数据库连接，点击上方「新建连接」'}
                      </div>
                    ) : (
                      filteredModelKeys.map(name => {
                        const modelObj = valuesAsObject(models[name])
                        const schedule = valuesAsObject(modelObj.schedule)
                        const isScheduled = isModelScheduleActive(schedule)
                        const isSelected = activeKey === name
                        const isUnsaved = hasModelUnsaved(name)
                        const summary = getModelDatabaseSummary(modelObj)

                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setSelectedKey(name)
                              setActiveCategory('databases')
                            }}
                            className={`w-full flex items-center justify-between rounded-lg p-2.5 text-left text-sm transition-all border ${
                              isSelected
                                ? 'bg-primary/10 border-primary/30 text-foreground shadow-xs font-medium'
                                : 'border-transparent hover:bg-muted/60 text-foreground'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                              <div className={`size-8 rounded-md flex items-center justify-center shrink-0 p-1 ${
                                isSelected ? 'bg-primary/15' : 'bg-muted/80'
                              }`}>
                                <img
                                  src={summary.icon}
                                  alt={summary.engineName}
                                  className="size-6 object-contain"
                                  onError={e => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-semibold uppercase">{name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                                    isSelected ? 'bg-primary/15 text-primary font-medium' : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {summary.engineName}
                                  </span>
                                </div>
                                <div className="text-[11px] truncate mt-0.5 text-muted-foreground">
                                  {summary.endpoint || String(modelObj.description || '无附加信息')}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isUnsaved ? (
                                <Tag color="orange" size="small" className="w-fit">改动</Tag>
                              ) : null}
                              <Tag
                                color={isScheduled ? 'green' : 'grey'}
                                size="small"
                                className="w-fit"
                              >
                                {isScheduled ? '计划' : '手动'}
                              </Tag>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>

                  {/* 快捷输入条（备用） */}
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-1.5">
                      <Input
                        aria-label="新模型名称"
                        placeholder="快捷命名新建..."
                        size="small"
                        value={newModelName}
                        onChange={setNewModelName}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addModel()
                          }
                        }}
                      />
                      <Button
                        icon={<Plus className="size-4" />}
                        size="small"
                        theme="light"
                        type="primary"
                        onClick={addModel}
                      >
                        新增
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧主画布 (Detail Editor) */}
              <div className="lg:col-span-8 xl:col-span-9">
                {activeKey === '__web__' ? (
                  <PageSection description="敏感字段只显示掩码；未修改时不会覆盖 YAML 中的原值。" title="基础设置">
                    <Card shadows="hover">
                      <SchemaObjectFields
                        fields={schema.global}
                        path="/web"
                        value={webConfig}
                        onDelete={deleteValue}
                        onSet={updateValue}
                      />
                    </Card>
                  </PageSection>
                ) : activeKey === '__global_other__' ? (
                  <PageSection title="其它全局配置">
                    <Card shadows="hover">
                      <ObjectFields
                        path=""
                        value={globalOther}
                        onDelete={deleteValue}
                        onSet={updateValue}
                      />
                    </Card>
                  </PageSection>
                ) : models[activeKey] ? (
                  <ModelEditor
                    key={activeKey}
                    name={activeKey}
                    path={toConfigPointer('models', activeKey)}
                    schema={schema}
                    value={models[activeKey]}
                    activeCategory={activeCategory}
                    onCategoryChange={setActiveCategory}
                    onDelete={(path) => {
                      deleteValue(path)
                      const remaining = modelKeys.filter(k => k !== activeKey)
                      setSelectedKey(remaining[0] || '__web__')
                    }}
                    onSet={updateValue}
                  />
                ) : (
                  <Card>
                    <Empty description="请在左侧列表选择要配置的模型或基础设置" />
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      </form>

      <Modal
        visible={summaryVisible}
        title="确认配置变更"
        okButtonProps={{ loading: saving }}
        onCancel={() => setSummaryVisible(false)}
        onOk={() => void saveChanges()}
      >
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            保存后会校验 YAML、原子替换文件并重新加载运行时配置。
          </p>
          <div className="grid gap-1 rounded-md bg-background-deep p-3 text-xs">
            {readableSummary.map((item, index) => (
              <div key={`${item}-${index}`}>{item}</div>
            ))}
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">查看原始变更路径</summary>
            <div className="mt-2 grid gap-1 rounded-md bg-background-deep p-3 font-mono text-[11px]">
              {operationSummary.map(item => <div key={item}>{item}</div>)}
            </div>
          </details>
        </div>
      </Modal>

      {/* dbx 风格新建数据库连接向导 */}
      <DbxNewConnectionModal
        existingNames={modelKeys}
        visible={isNewConnectionModalOpen}
        onClose={() => setIsNewConnectionModalOpen(false)}
        onConfirm={handleCreateConnection}
      />
    </Page>
  )
}

export type { ConfigObject }

