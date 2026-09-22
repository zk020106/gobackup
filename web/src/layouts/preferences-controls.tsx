import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, Select, Switch } from '@douyinfe/semi-ui-19'

import { getPreferenceStepAria } from '@/i18n/admin-i18n'
import { cn } from '@/lib/utils'

type PreferenceOption<TValue extends string> = {
  label: string
  value: TValue
}

type PreferenceBlockProps = {
  children: ReactNode
  title: string
}

type PreferenceNumberProps = {
  disabled?: boolean
  label: string
  locale: string
  max: number
  min: number
  onValueChange: (value: number) => void
  step?: number
  value: number
}

type PreferenceTextProps = {
  disabled?: boolean
  label: string
  onValueChange: (value: string) => void
  value: string
}

type PreferenceSegmentedProps<TValue extends string> = {
  disabled?: boolean
  items: Array<PreferenceOption<TValue>>
  label: string
  onValueChange: (value: TValue) => void
  value: TValue
}

type PreferenceCheckboxGroupProps<TValue extends string> = {
  disabled?: boolean
  items: Array<PreferenceOption<TValue>>
  label: string
  onValuesChange: (values: TValue[]) => void
  values: TValue[]
}

type PreferenceSelectProps<TValue extends string> = {
  disabled?: boolean
  items: Array<PreferenceOption<TValue>>
  label: string
  onValueChange: (value: TValue) => void
  value: TValue
}

type PreferenceToggleProps = {
  checked: boolean
  disabled?: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
  shortcut?: string
}

/**
 * 渲染偏好设置面板中的分组区块。
 */
export function PreferenceBlock({ children, title }: PreferenceBlockProps) {
  return (
    <section className="flex flex-col border-b py-4 last:border-b-0">
      <h3 className="mb-3 text-sm font-semibold leading-none tracking-normal">{title}</h3>
      <div className="grid gap-1">{children}</div>
    </section>
  )
}

/**
 * 渲染偏好设置中的数值步进控件。
 */
export function PreferenceNumber({
  disabled = false,
  label,
  locale,
  max,
  min,
  onValueChange,
  step = 1,
  value
}: PreferenceNumberProps) {
  const setNext = (next: number) => onValueChange(Math.min(Math.max(next, min), max))

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-accent',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <label className="text-sm font-medium">{label}</label>
      <div className="grid grid-cols-[1.9rem_4.25rem_1.9rem] items-center overflow-hidden rounded-md border bg-background">
        <button
          aria-label={getPreferenceStepAria(locale, 'decrease', label)}
          className="flex h-7 items-center justify-center rounded-none border-0 bg-transparent text-foreground hover:bg-muted cursor-pointer disabled:opacity-50"
          disabled={disabled}
          onClick={() => setNext(value - step)}
          type="button"
        >
          <span className="text-base leading-none">-</span>
        </button>
        <input
          aria-label={label}
          className="h-7 w-full border-y-0 border-x border-input bg-transparent px-1 text-center text-xs tabular-nums outline-hidden"
          disabled={disabled}
          max={max}
          min={min}
          onChange={event => setNext(Number(event.target.value))}
          step={step}
          type="number"
          value={value}
        />
        <button
          aria-label={getPreferenceStepAria(locale, 'increase', label)}
          className="flex h-7 items-center justify-center rounded-none border-0 bg-transparent text-foreground hover:bg-muted cursor-pointer disabled:opacity-50"
          disabled={disabled}
          onClick={() => setNext(value + step)}
          type="button"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * 渲染偏好设置中的文本输入项。
 */
export function PreferenceText({
  disabled = false,
  label,
  onValueChange,
  value
}: PreferenceTextProps) {
  return (
    <div
      className={cn(
        'grid gap-2 rounded-md px-2 py-2.5 hover:bg-accent',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <label className="text-sm font-medium">{label}</label>
      <input
        aria-label={label}
        className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-hidden focus:border-primary"
        disabled={disabled}
        onChange={event => onValueChange(event.target.value)}
        value={value}
      />
    </div>
  )
}

/**
 * 渲染偏好设置中的分段单选控件。
 */
export function PreferenceSegmented<TValue extends string>({
  disabled = false,
  items,
  label,
  onValueChange,
  value
}: PreferenceSegmentedProps<TValue>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-accent',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <label className="shrink-0 text-sm font-medium">{label}</label>
      <div className="flex flex-wrap justify-end gap-2">
        {items.map(item => {
          const active = value === item.value

          return (
            <Button
              aria-pressed={active}
              data-active={active ? 'true' : undefined}
              className={cn(
                'h-7 rounded-sm px-2 text-xs !font-normal',
                active && '!border-primary !bg-primary !text-primary-foreground shadow-none'
              )}
              disabled={disabled}
              key={item.value}
              onClick={() => onValueChange(item.value)}
              type="primary"
              theme={active ? 'solid' : 'light'}
            >
              {item.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 渲染偏好设置中的多选按钮组。
 */
export function PreferenceCheckboxGroup<TValue extends string>({
  disabled = false,
  items,
  label,
  onValuesChange,
  values
}: PreferenceCheckboxGroupProps<TValue>) {
  function toggleValue(value: TValue) {
    if (values.includes(value)) {
      onValuesChange(values.filter(item => item !== value))
      return
    }

    onValuesChange([...values, value])
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-accent',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <label className="shrink-0 text-sm font-medium">{label}</label>
      <div className="flex flex-wrap justify-end gap-2">
        {items.map(item => {
          const active = values.includes(item.value)

          return (
            <Button
              aria-pressed={active}
              data-active={active ? 'true' : undefined}
              className={cn(
                'h-7 rounded-sm px-2 text-xs !font-normal',
                active && '!border-primary !bg-primary !text-primary-foreground shadow-none'
              )}
              disabled={disabled}
              key={item.value}
              onClick={() => toggleValue(item.value)}
              type="primary"
              theme={active ? 'solid' : 'light'}
            >
              {item.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 渲染偏好设置中的下拉选择控件。
 */
export function PreferenceSelect<TValue extends string>({
  disabled = false,
  items,
  label,
  onValueChange,
  value
}: PreferenceSelectProps<TValue>) {
  const labelId = `pref-select-label-${label.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}`

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-accent',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <label id={labelId} className="shrink-0 text-sm font-medium">
        {label}
      </label>
      <Select
        aria-labelledby={labelId}
        disabled={disabled}
        onChange={val => onValueChange(val as TValue)}
        value={value}
        className="w-[165px]"
        optionList={items.map(item => ({ label: item.label, value: item.value }))}
      />
    </div>
  )
}

/**
 * 渲染偏好设置中的开关项。
 */
export function PreferenceToggle({
  checked,
  disabled = false,
  label,
  onCheckedChange,
  shortcut
}: PreferenceToggleProps) {
  const containerRef = (node: HTMLDivElement | null) => {
    if (node) {
      const input = node.querySelector('input[role="switch"]')
      if (input) {
        input.setAttribute('data-state', checked ? 'checked' : 'unchecked')
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'my-1 flex w-full items-center justify-between rounded-md px-2 py-2.5 hover:bg-accent cursor-pointer',
        disabled && 'pointer-events-none opacity-50'
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      {shortcut ? (
        <span className="mr-2 ml-auto shrink-0 text-xs opacity-60">{shortcut}</span>
      ) : null}
      <Switch
        checked={checked}
        data-state={checked ? 'checked' : 'unchecked'}
        disabled={disabled}
        onChange={checkedState => onCheckedChange(checkedState)}
      />
    </div>
  )
}
