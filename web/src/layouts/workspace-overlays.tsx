import { useDebounce } from 'ahooks'
import { CircleUserRound, LockKeyhole, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Input, Modal } from '@douyinfe/semi-ui-19'

import { getAdminMessages } from '@/i18n/admin-i18n'
import { ADMIN_DEFAULT_PATH, getMenuTitle } from '@/router/app-data'
import type { MenuRecord } from '@/types'
import { buildWorkspaceSearchItems } from '@/utils/menu'

type GlobalSearchDialogProps = {
  locale: string
  menu: MenuRecord[]
  navigate: (path: string) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

type LockScreenSetupDialogProps = {
  locale: string
  onOpenChange: (open: boolean) => void
  onSubmit: (password: string) => void
  open: boolean
}

type LockScreenOverlayProps = {
  locale: string
  onUnlock: () => void
  password: string
  timezone: string
}

/**
 * 渲染菜单路由的全局搜索弹窗。
 */
export function GlobalSearchDialog({
  locale,
  menu,
  navigate,
  onOpenChange,
  open
}: GlobalSearchDialogProps) {
  const messages = getAdminMessages(locale)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, { wait: 120 })
  const defaultSearchTerm = getMenuTitle(ADMIN_DEFAULT_PATH, menu)

  const searchItems = useMemo(
    () =>
      buildWorkspaceSearchItems(menu).map(item => ({
        ...item,
        haystack: `${item.title} ${item.description} ${item.keyword}`.toLowerCase()
      })),
    [menu]
  )
  const results = useMemo(() => {
    const normalizedQuery = (debouncedQuery || defaultSearchTerm).trim().toLowerCase()

    if (!normalizedQuery) {
      return []
    }

    return searchItems.filter(item => item.haystack.includes(normalizedQuery))
  }, [debouncedQuery, defaultSearchTerm, searchItems])

  return (
    <Modal
      motion={false}
      visible={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      title={messages.search.title}
      width={540}
    >
      <div className="flex flex-col gap-3 py-1">
        <Input
          prefix={<Search className="size-4 text-muted-foreground" />}
          value={query}
          onChange={val => setQuery(val)}
          placeholder={messages.search.placeholder}
          autoFocus
          showClear
        />
        <div className="max-h-72 overflow-y-auto flex flex-col gap-1 pr-1">
          {results.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {messages.search.empty}
            </div>
          ) : (
            results.map(item => (
              <button
                key={`${item.type}:${item.title}:${item.path}`}
                className="flex items-center gap-3 w-full text-left p-2 rounded-md hover:bg-muted/80 cursor-pointer border-0 bg-transparent text-inherit transition-colors"
                onClick={() => {
                  navigate(item.path)
                  onOpenChange(false)
                }}
              >
                <Search className="size-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium leading-tight">{item.title}</span>
                  <span className="text-xs text-muted-foreground truncate">{item.description}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}

/**
 * 渲染本次会话的锁屏密码设置弹窗。
 */
export function LockScreenSetupDialog({
  locale,
  onOpenChange,
  onSubmit,
  open
}: LockScreenSetupDialogProps) {
  const messages = getAdminMessages(locale)
  const [password, setPassword] = useState('')

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)

    if (!nextOpen) {
      setPassword('')
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!password.trim()) {
      return
    }

    onSubmit(password)
    setPassword('')
  }

  return (
    <Modal
      motion={false}
      visible={open}
      onCancel={() => handleOpenChange(false)}
      footer={null}
      title={messages.lock.title}
      width={380}
    >
      <form className="grid gap-4 pt-2" onSubmit={handleSubmit}>
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-accent text-muted-foreground">
            <CircleUserRound className="size-8" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="lock-screen-password">
            {messages.lock.password}
          </label>
          <Input
            autoFocus
            id="lock-screen-password"
            mode="password"
            value={password}
            onChange={val => setPassword(val)}
            placeholder={messages.lock.placeholder}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={() => handleOpenChange(false)} theme="borderless" type="tertiary">
            {messages.common.cancel}
          </Button>
          <Button disabled={!password.trim()} htmlType="submit" theme="solid" type="primary">
            {messages.lock.title}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * 渲染锁屏界面并处理解锁表单。
 */
export function LockScreenOverlay({
  locale,
  onUnlock,
  password,
  timezone
}: LockScreenOverlayProps) {
  const messages = getAdminMessages(locale)
  const [now, setNow] = useState(() => new Date())
  const [showUnlockForm, setShowUnlockForm] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const timer = window.setInterval(() => setNow(new Date()), 1000)

    document.body.style.overflow = 'hidden'

    return () => {
      window.clearInterval(timer)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const formatters = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric'
      }),
      hour: new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: timezone
      }),
      meridiem: new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        hour12: true,
        timeZone: timezone
      }),
      minute: new Intl.DateTimeFormat('en-US', {
        minute: '2-digit',
        timeZone: timezone
      })
    }),
    [locale, timezone]
  )
  const hour = formatters.hour.format(now)
  const minute = formatters.minute.format(now)
  const meridiem =
    formatters.meridiem.formatToParts(now).find(part => part.type === 'dayPeriod')?.value ?? ''
  const date = formatters.date.format(now)

  function openUnlockForm() {
    setError('')
    setShowUnlockForm(true)
  }

  function closeUnlockForm() {
    setError('')
    setUnlockPassword('')
    setShowUnlockForm(false)
  }

  function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (unlockPassword === password) {
      onUnlock()
      return
    }

    setError(messages.lock.error)
  }

  return (
    <div
      aria-labelledby="lock-screen-title"
      aria-modal="true"
      className="fixed inset-0 z-[2000] bg-background text-foreground"
      role="dialog"
    >
      <h2 className="sr-only" id="lock-screen-title">
        {messages.lock.screenTitle}
      </h2>
      {!showUnlockForm ? (
        <div className="size-full">
          <button
            className="group fixed top-6 left-1/2 z-[2001] flex -translate-x-1/2 flex-col items-center gap-1 text-xl font-semibold text-foreground/80 transition-colors hover:text-foreground border-0 bg-transparent cursor-pointer"
            onClick={openUnlockForm}
            type="button"
          >
            <LockKeyhole className="size-5 transition-transform group-hover:scale-125" />
            <span>{messages.lock.unlock}</span>
          </button>
          <div className="flex size-full items-center justify-center">
            <div className="flex w-full justify-center gap-4 px-4 sm:gap-6 md:gap-8">
              <div className="relative flex h-35 w-35 items-center justify-center rounded-xl bg-accent text-[36px] font-medium sm:h-40 sm:w-40 sm:text-[42px] md:h-50 md:w-50 md:text-[72px]">
                <span className="absolute top-3 left-3 text-xs font-semibold sm:text-sm md:text-xl">
                  {meridiem}
                </span>
                {hour}
              </div>
              <div className="flex h-35 w-35 items-center justify-center rounded-xl bg-accent text-[36px] font-medium sm:h-40 sm:w-40 sm:text-[42px] md:h-50 md:w-50 md:text-[72px]">
                {minute}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form className="flex size-full items-center justify-center" onSubmit={handleUnlock}>
          <div className="mb-10 flex w-[90%] max-w-75 flex-col items-center px-4">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-accent text-muted-foreground">
              <CircleUserRound className="size-10" />
            </div>
            <div className="mb-4 w-full">
              <label className="sr-only" htmlFor="lock-screen-unlock-password">
                {messages.lock.password}
              </label>
              <Input
                autoFocus
                id="lock-screen-unlock-password"
                mode="password"
                onChange={val => {
                  setError('')
                  setUnlockPassword(val)
                }}
                placeholder={messages.lock.placeholder}
                value={unlockPassword}
                className="w-full"
              />
              {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
            </div>
            <Button className="w-full mb-2" htmlType="submit" theme="solid" type="primary">
              {messages.lock.submit}
            </Button>
            <Button className="w-full" onClick={closeUnlockForm} theme="borderless" type="tertiary">
              {messages.lock.back}
            </Button>
          </div>
        </form>
      )}
      <div className="absolute bottom-5 w-full text-center text-xl md:text-2xl xl:text-xl 2xl:text-3xl">
        {showUnlockForm ? (
          <div className="mb-2 text-2xl md:text-3xl">
            {hour}:{minute} <span className="text-base md:text-lg">{meridiem}</span>
          </div>
        ) : null}
        <div className="text-xl md:text-3xl">{date}</div>
      </div>
    </div>
  )
}
