import { describe, expect, it, vi } from 'vitest'

import { FormApi } from '@/utils/form-api'

describe('form api', () => {
  it('reads live values when the mounted form exposes a values getter', async () => {
    const store: Record<string, unknown> = { name: 'before' }
    const api = new FormApi()

    api.mount({
      reset: vi.fn(),
      setValue: (fieldName, value) => {
        store[fieldName] = value
      },
      submit: vi.fn(),
      validate: vi.fn(async () => ({ valid: true })),
      // 适配层必须用 getter 暴露表单值，确保 mount 后的变更可被读取。
      get values() {
        return { ...store }
      }
    })

    store.name = 'after'

    await expect(api.getValues()).resolves.toEqual({ name: 'after' })
  })

  it('formats range, multi-value and schema valueFormat output without mutating source values', async () => {
    const api = new FormApi({
      arrayToStringFields: [[['tags'], ';']],
      fieldMappingTime: [['period', ['startedAt', 'endedAt'], null]],
      schema: [
        {
          component: 'date-range',
          fieldName: 'filters.range',
          valueFormat: (value, setValue) => {
            const range = value as string[] | undefined

            setValue('filters.start', range?.[0])
            setValue('filters.end', range?.[1])
          }
        }
      ]
    })

    const values = {
      filters: { range: ['2026-01-01', '2026-01-31'] },
      period: ['2026-02-01', '2026-02-28'],
      tags: ['admin', 'audit']
    }

    api.mount({
      reset: vi.fn(),
      setValue: vi.fn(),
      submit: vi.fn(),
      validate: vi.fn(async () => ({ valid: true })),
      values
    })

    await expect(api.getValues()).resolves.toEqual({
      endedAt: '2026-02-28',
      filters: {
        end: '2026-01-31',
        start: '2026-01-01'
      },
      startedAt: '2026-02-01',
      tags: 'admin;audit'
    })
    expect(values.filters.range).toEqual(['2026-01-01', '2026-01-31'])
  })

  it('updates schema by fieldName and submits formatted values', async () => {
    const onSubmit = vi.fn()
    const submit = vi.fn()
    const api = new FormApi({
      handleSubmit: onSubmit,
      schema: [
        { component: 'input', fieldName: 'name', label: 'Name' },
        { component: 'input', fieldName: 'email', label: 'Email' }
      ]
    })

    api.updateSchema([{ fieldName: 'email', label: 'Work email' }])
    api.mount({
      reset: vi.fn(),
      setValue: vi.fn(),
      submit,
      validate: vi.fn(async () => ({ valid: true })),
      values: { email: 'root@example.com', name: 'Root' }
    })

    await expect(api.submit()).resolves.toEqual({
      email: 'root@example.com',
      name: 'Root'
    })
    expect(api.getState().schema?.[1]?.label).toBe('Work email')
    expect(submit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'root@example.com',
      name: 'Root'
    })
  })
})
