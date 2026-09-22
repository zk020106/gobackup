import cloneDeep from 'lodash-es/cloneDeep'
import get from 'lodash-es/get'
import set from 'lodash-es/set'
import unset from 'lodash-es/unset'

import type {
  ArrayToStringFields,
  FieldMappingFormatter,
  FieldMappingTime,
  FormSchema
} from '@/types'

interface ValidationResult {
  errors?: Record<string, unknown>
  valid: boolean
}

// 类型：MountedForm。描述 FormApi 需要宿主表单提供的最小能力。
interface MountedForm {
  reset: () => void
  setValue: (fieldName: string, value: unknown) => void
  submit: () => Promise<void> | void
  validate: () => Promise<ValidationResult> | ValidationResult
  values: Record<string, unknown>
}

export interface FormApiOptions {
  arrayToStringFields?: ArrayToStringFields
  fieldMappingTime?: FieldMappingTime
  handleSubmit?: (values: Record<string, unknown>) => Promise<void> | void
  schema?: FormSchema[]
}

// 缺省空 schema 用模块级常量，保证 getSchema 在无字段时仍返回稳定引用。
const EMPTY_SCHEMA: readonly FormSchema[] = []

// 类：FormApi。封装表单挂载、校验、提交和字段转换能力。
export class FormApi {
  private form?: MountedForm
  private listeners = new Set<() => void>()
  private state: FormApiOptions

  // 方法：constructor。初始化表单 API 配置并填充默认数组字段。
  constructor(options: FormApiOptions = {}) {
    this.state = {
      arrayToStringFields: [],
      fieldMappingTime: [],
      schema: [],
      ...options
    }
  }

  // 方法：getState。读取当前表单 API 配置。
  getState() {
    return this.state
  }

  // 方法：getSchema。读取当前 schema 快照，供 useSyncExternalStore 订阅；引用随 updateSchema 变化。
  // 用箭头字段保证实例上引用稳定，避免 useSyncExternalStore 反复重订阅。
  getSchema = () => this.state.schema ?? EMPTY_SCHEMA

  // 方法：subscribe。订阅 schema 变更，返回取消订阅函数；同样用箭头字段保持引用稳定。
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // 方法：getValues。获取表单值并按提交规则转换字段。
  async getValues() {
    const form = this.getMountedForm()
    const values = cloneDeep(form.values)

    // 对齐上游提交流程：先归一化数组，再展开时间范围，最后执行字段格式化。
    this.applyArrayToString(values)
    this.applyFieldMappingTime(values)
    this.applyValueFormat(values)

    return values
  }

  // 方法：mount。绑定宿主表单实例，供后续提交和重置调用。
  mount(form: MountedForm) {
    this.form = form
  }

  // 方法：reset。调用宿主表单重置能力。
  reset() {
    this.getMountedForm().reset()
  }

  // 方法：setValue。写入宿主表单的单个字段值。
  setValue(fieldName: string, value: unknown) {
    this.getMountedForm().setValue(fieldName, value)
  }

  // 方法：submit。校验通过后提交表单并返回转换后的值。
  async submit() {
    const form = this.getMountedForm()
    const validation = await form.validate()

    if (!validation.valid) {
      return undefined
    }

    await form.submit()
    const values = await this.getValues()
    await this.state.handleSubmit?.(values)

    return values
  }

  // 方法：updateSchema。按 fieldName 更新已有 schema 项。
  updateSchema(updates: Partial<FormSchema>[]) {
    if (!updates.every(item => item.fieldName)) {
      console.error(
        'All items in the schema array must have a valid `fieldName` property to be updated'
      )
      return
    }

    const updateMap = new Map(updates.map(item => [item.fieldName, item]))
    const schema = this.state.schema ?? []

    this.state = {
      ...this.state,
      schema: schema.map(item => ({ ...item, ...updateMap.get(item.fieldName) }))
    }

    // 通知订阅者（SchemaForm）schema 已变化，触发重渲染。
    this.emitChange()
  }

  // 方法：emitChange。逐一通知 schema 订阅者。
  private emitChange() {
    this.listeners.forEach(listener => listener())
  }

  // 方法：applyArrayToString。把指定数组字段转换成分隔字符串。
  private applyArrayToString(values: Record<string, unknown>) {
    const fields = this.state.arrayToStringFields ?? []

    fields.forEach(fieldConfig => {
      if (typeof fieldConfig === 'string') {
        this.convertArrayField(values, fieldConfig, ',')
        return
      }

      const [fieldNames, separator = ','] = fieldConfig
      fieldNames.forEach(fieldName => this.convertArrayField(values, fieldName, separator))
    })
  }

  // 方法：applyFieldMappingTime。把时间范围字段拆成开始和结束字段。
  private applyFieldMappingTime(values: Record<string, unknown>) {
    const fields = this.state.fieldMappingTime ?? []

    fields.forEach(([fieldName, [startField, endField], formatter = 'YYYY-MM-DD']) => {
      const value = get(values, fieldName) as unknown[] | undefined

      // 即使值无效，也先移除范围字段，再写入后端友好的起止字段。
      unset(values, fieldName)
      if (!Array.isArray(value)) {
        return
      }

      set(values, startField, this.formatMappedValue(value[0], startField, formatter))
      set(values, endField, this.formatMappedValue(value[1], endField, formatter))
    })
  }

  // 方法：applyValueFormat。执行 schema 中的自定义值格式化。
  private applyValueFormat(values: Record<string, unknown>) {
    const schema = this.state.schema ?? []

    schema.forEach(field => {
      if (!field.valueFormat) {
        return
      }

      const value = get(values, field.fieldName)
      unset(values, field.fieldName)

      const formatted = field.valueFormat(
        value,
        // 设置函数允许格式化器把一个界面字段拆成多个提交字段。
        (fieldName, nextValue) => set(values, fieldName, nextValue),
        values
      )

      if (formatted !== undefined) {
        set(values, field.fieldName, formatted)
      }
    })
  }

  // 方法：convertArrayField。把单个数组字段写回为字符串。
  private convertArrayField(values: Record<string, unknown>, fieldName: string, separator: string) {
    const value = get(values, fieldName)

    if (Array.isArray(value)) {
      set(values, fieldName, value.join(separator))
    }
  }

  // 方法：formatMappedValue。按时间映射配置格式化单个值。
  private formatMappedValue(value: unknown, fieldName: string, formatter: FieldMappingFormatter) {
    if (formatter === null) {
      return value
    }

    if (typeof formatter === 'function') {
      return formatter(value, fieldName)
    }

    if (Array.isArray(formatter)) {
      return value
    }

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10)
    }

    return value
  }

  // 方法：getMountedForm。获取已挂载表单，未挂载时抛出明确错误。
  private getMountedForm() {
    if (!this.form) {
      throw new Error('<AdminForm /> is not mounted')
    }

    return this.form
  }
}
