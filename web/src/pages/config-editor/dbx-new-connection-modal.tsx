import { useMemo, useState } from 'react'
import {
  Button,
  Input,
  Modal,
  Tag
} from '@douyinfe/semi-ui-19'
import { Database, Search, ChevronRight, Check } from 'lucide-react'

export interface DatabaseEngineDef {
  id: string
  name: string
  category: 'relational' | 'document' | 'timeseries'
  icon: string
  type: string
  defaultPort?: number
  description: string
}

export const DATABASE_ENGINES: DatabaseEngineDef[] = [
  // 关系型数据库 (6款)
  {
    id: 'mysql',
    name: 'MySQL',
    category: 'relational',
    icon: '/icons/database/mysql.svg',
    type: 'mysql',
    defaultPort: 3306,
    description: '主流开源关系型数据库，通过 mysqldump 备份'
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    category: 'relational',
    icon: '/icons/database/postgres.svg',
    type: 'postgresql',
    defaultPort: 5432,
    description: '高级对象关系型数据库，通过 pg_dump 备份'
  },
  {
    id: 'mssql',
    name: 'SQL Server',
    category: 'relational',
    icon: '/icons/database/sqlserver.svg',
    type: 'mssql',
    defaultPort: 1433,
    description: 'Microsoft 企业级数据库，通过 sqlcmd / smb 备份'
  },
  {
    id: 'mariadb',
    name: 'MariaDB',
    category: 'relational',
    icon: '/icons/database/mariadb.svg',
    type: 'mariadb',
    defaultPort: 3306,
    description: 'MySQL 高性能开源分支，通过 mariadb-dump 备份'
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    category: 'relational',
    icon: '/icons/database/sqlite.svg',
    type: 'sqlite',
    description: '轻量级嵌入式数据库，直接复制或 dump 归档'
  },
  {
    id: 'firebird',
    name: 'Firebird',
    category: 'relational',
    icon: '/icons/database/firebird.svg',
    type: 'firebird',
    defaultPort: 3050,
    description: '开源关系型数据库，通过 gbak 工具备份'
  },

  // 文档与缓存 (NoSQL, 2款)
  {
    id: 'redis',
    name: 'Redis',
    category: 'document',
    icon: '/icons/database/redis.svg',
    type: 'redis',
    defaultPort: 6379,
    description: '高性能内存键值数据库，通过 BGSAVE / RDB 备份'
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    category: 'document',
    icon: '/icons/database/mongodb.svg',
    type: 'mongodb',
    defaultPort: 27017,
    description: '主流文档型 NoSQL 数据库，通过 mongodump 备份'
  },

  // 时序与配置中心 (2款)
  {
    id: 'influxdb',
    name: 'InfluxDB',
    category: 'timeseries',
    icon: '/icons/database/influxdb.svg',
    type: 'influxdb2',
    defaultPort: 8086,
    description: '时序数据存储引擎，通过 influx backup 备份'
  },
  {
    id: 'etcd',
    name: 'etcd',
    category: 'timeseries',
    icon: '/icons/database/etcd.svg',
    type: 'etcd',
    defaultPort: 2379,
    description: '分布式高可用键值存储，通过 etcdctl snapshot 备份'
  }
]

export const DB_CATEGORIES = [
  { key: 'all', label: '全部数据库 (10)' },
  { key: 'relational', label: '关系型数据库 (6)' },
  { key: 'document', label: '文档与缓存 (2)' },
  { key: 'timeseries', label: '时序与配置 (2)' }
]

export function getDatabaseIcon(type: string): string {
  const engine = DATABASE_ENGINES.find(
    e => e.type.toLowerCase() === type.toLowerCase() || e.id.toLowerCase() === type.toLowerCase()
  )
  return engine?.icon || '/icons/database/mysql.svg'
}

export function getDatabaseEngineName(type: string): string {
  const engine = DATABASE_ENGINES.find(
    e => e.type.toLowerCase() === type.toLowerCase() || e.id.toLowerCase() === type.toLowerCase()
  )
  return engine?.name || type.toUpperCase()
}

interface DbxNewConnectionModalProps {
  visible: boolean
  onClose: () => void
  onConfirm: (connectionName: string, engine: DatabaseEngineDef) => void
  existingNames: string[]
}

export function DbxNewConnectionModal({
  visible,
  onClose,
  onConfirm,
  existingNames
}: DbxNewConnectionModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>('relational')
  const [search, setSearch] = useState<string>('')
  const [selectedEngineId, setSelectedEngineId] = useState<string>('mysql')
  const [step, setStep] = useState<'select' | 'name'>('select')
  const [connectionName, setConnectionName] = useState<string>('')
  const [nameError, setNameError] = useState<string>('')

  const selectedEngine = useMemo(
    () => DATABASE_ENGINES.find(e => e.id === selectedEngineId) || DATABASE_ENGINES[0],
    [selectedEngineId]
  )

  const filteredEngines = useMemo(() => {
    return DATABASE_ENGINES.filter(engine => {
      const matchCat = activeCategory === 'all' || engine.category === activeCategory
      const needle = search.trim().toLowerCase()
      const matchSearch =
        !needle ||
        engine.name.toLowerCase().includes(needle) ||
        engine.id.toLowerCase().includes(needle) ||
        (engine.description && engine.description.toLowerCase().includes(needle))
      return matchCat && matchSearch
    })
  }, [activeCategory, search])

  const handleSelectEngine = (engine: DatabaseEngineDef) => {
    setSelectedEngineId(engine.id)
  }

  const handleGoToNameStep = () => {
    if (!selectedEngine) return
    // 生成默认名称，如 mysql-1
    let defaultName = selectedEngine.id
    let counter = 1
    while (existingNames.includes(defaultName)) {
      defaultName = `${selectedEngine.id}-${counter}`
      counter++
    }
    setConnectionName(defaultName)
    setNameError('')
    setStep('name')
  }

  const handleConfirm = () => {
    const trimmed = connectionName.trim().toLowerCase()
    if (!trimmed) {
      setNameError('请输入连接名称')
      return
    }
    if (!/^[a-z0-9_-]+$/.test(trimmed)) {
      setNameError('连接名称仅支持小写字母、数字、下划线及中划线')
      return
    }
    if (existingNames.includes(trimmed)) {
      setNameError(`已存在名为「${trimmed}」的连接`)
      return
    }

    onConfirm(trimmed, selectedEngine)
    handleClose()
  }

  const handleClose = () => {
    setStep('select')
    setSearch('')
    setNameError('')
    onClose()
  }

  return (
    <Modal
      visible={visible}
      title={step === 'select' ? '新建连接' : `创建 ${selectedEngine.name} 连接`}
      width={780}
      onCancel={handleClose}
      footer={null}
      bodyStyle={{ padding: 0 }}
      closeOnEsc={true}
    >
      {step === 'select' ? (
        <div className="flex flex-col h-[520px]">
          {/* 搜索与工具栏 */}
          <div className="p-4 border-b flex items-center justify-between gap-3 bg-card">
            <div className="flex-1 max-w-sm">
              <Input
                placeholder="搜索数据库类型..."
                prefix={<Search className="size-4 text-muted-foreground" />}
                showClear
                value={search}
                onChange={setSearch}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>支持 10+ 款主流及国产数据库备份</span>
            </div>
          </div>

          {/* 左右结构：分类 + 图标网格 */}
          <div className="flex flex-1 min-h-0">
            {/* 左侧分类 */}
            <div className="w-44 border-r bg-muted/20 p-2 space-y-1 overflow-y-auto">
              {DB_CATEGORIES.map(cat => {
                const isActive = activeCategory === cat.key
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveCategory(cat.key)}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                )
              })}
            </div>

            {/* 右侧卡片网格 (dbx 风格) */}
            <div className="flex-1 p-5 overflow-y-auto bg-background">
              {filteredEngines.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  未匹配到相关数据库类型
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3.5">
                  {filteredEngines.map(engine => {
                    const isSelected = selectedEngineId === engine.id
                    return (
                      <div
                        key={engine.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectEngine(engine)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleSelectEngine(engine)
                          }
                        }}
                        className={`group relative flex flex-col items-center justify-center p-4 rounded-xl border text-center cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20'
                            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40 hover:shadow-xs'
                        }`}
                      >
                        {/* 选中徽标 */}
                        {isSelected ? (
                          <div className="absolute top-2 right-2 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                            <Check className="size-3 stroke-[3]" />
                          </div>
                        ) : null}

                        {/* 数据库图标 */}
                        <div className="size-12 flex items-center justify-center mb-2.5 transition-transform group-hover:scale-105">
                          <img
                            src={engine.icon}
                            alt={engine.name}
                            className="max-h-11 max-w-11 object-contain drop-shadow-xs"
                            onError={e => {
                              // 降级使用 Database 图标
                              e.currentTarget.style.display = 'none'
                              if (e.currentTarget.nextElementSibling) {
                                (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex'
                              }
                            }}
                          />
                          <div className="hidden size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Database className="size-6" />
                          </div>
                        </div>

                        {/* 数据库名称 */}
                        <div className="text-sm font-semibold text-foreground tracking-tight line-clamp-1">
                          {engine.name}
                        </div>

                        {/* 端口与类型说明 */}
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          {engine.defaultPort ? `端口: ${engine.defaultPort}` : '单文件'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 底部状态栏与操作按钮 */}
          <div className="p-3.5 border-t bg-card flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-sm">
              <img
                src={selectedEngine.icon}
                alt={selectedEngine.name}
                className="size-5 object-contain"
              />
              <span>
                已选择: <span className="font-semibold">{selectedEngine.name}</span>
              </span>
              <Tag color="green" size="small">
                官方备份支持
              </Tag>
            </div>

            <Button
              theme="solid"
              type="primary"
              onClick={handleGoToNameStep}
              className="px-5 font-medium"
            >
              下一步
              <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      ) : (
        /* 第二步：填写连接名称与快速初始配置 */
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3.5 p-4 rounded-xl border bg-muted/30">
            <img src={selectedEngine.icon} alt={selectedEngine.name} className="size-10 object-contain" />
            <div>
              <div className="font-semibold text-base">{selectedEngine.name} 数据库备份</div>
              <div className="text-xs text-muted-foreground">
                {selectedEngine.description || '配置连接信息以开始定时备份'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium">
              连接名称 <span className="text-destructive">*</span>
            </label>
            <Input
              value={connectionName}
              onChange={val => {
                setConnectionName(val)
                setNameError('')
              }}
              placeholder={`例如: ${selectedEngine.id}-prod`}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleConfirm()
                }
              }}
            />
            {nameError ? (
              <p className="text-xs text-destructive">{nameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                连接名称将作为该数据库在 GoBackup 中的唯一标识，支持小写字母、数字及横杠。
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            <Button theme="light" type="tertiary" onClick={() => setStep('select')}>
              上一步
            </Button>
            <Button theme="solid" type="primary" onClick={handleConfirm}>
              完成创建并配置
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
