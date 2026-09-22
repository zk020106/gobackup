import type { CSSProperties, ReactNode } from 'react'
import { Button } from '@douyinfe/semi-ui-19'

import { cn } from '@/lib/utils'

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'secondary'

export interface StatusPageAction {
  className?: string
  label: string
  onClick: () => void
  variant?: ButtonVariant
}

interface StatusPageProps {
  actions: StatusPageAction[]
  code: string
  dataSlot: string
  description: string
  detail?: ReactNode
  footerLinks?: string[]
  title: string
  tone?: 'danger' | 'neutral' | 'warning'
}

const toneClasses = {
  danger: {
    code: 'text-destructive/85',
    glow: 'bg-destructive/10'
  },
  neutral: {
    code: 'text-slate-800/85 dark:text-slate-100/80',
    glow: 'bg-slate-400/12 dark:bg-slate-300/10'
  },
  warning: {
    code: 'text-warning/90',
    glow: 'bg-warning/10'
  }
}

const defaultFooterLinks = ['常见问题', '联系我们', '帮助中心']

const statusPageBackgroundStyle = {
  backgroundImage:
    'radial-gradient(circle at 50% 36%, hsl(var(--background)) 0%, hsl(var(--background)) 34%, hsl(var(--muted) / 0.42) 68%, transparent 100%)'
} satisfies CSSProperties

const horizonMistStyle = {
  background:
    'linear-gradient(90deg, transparent 0%, hsl(var(--background) / 0.9) 20%, hsl(var(--background)) 50%, hsl(var(--background) / 0.9) 80%, transparent 100%)'
} satisfies CSSProperties

const lightBeamStyle = {
  background:
    'linear-gradient(180deg, hsl(var(--background) / 0.96) 0%, hsl(var(--background) / 0.72) 46%, hsl(var(--muted) / 0.14) 100%)',
  clipPath: 'polygon(50% 0, 100% 100%, 0 100%)'
} satisfies CSSProperties

const codeShadowStyle = {
  textShadow: '0 28px 80px hsl(var(--foreground) / 0.12)'
} satisfies CSSProperties

/** 渲染异常状态页面（403、404、500 等）。 */
export function StatusPage({
  actions,
  code,
  dataSlot,
  description,
  detail,
  footerLinks = defaultFooterLinks,
  title,
  tone = 'neutral'
}: StatusPageProps) {
  const currentTone = toneClasses[tone]

  return (
    <section
      className="relative flex min-h-[calc(100vh-var(--admin-header-height))] w-full flex-col justify-between overflow-hidden px-6 py-10"
      data-slot={dataSlot}
      style={statusPageBackgroundStyle}
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-16 left-1/2 h-72 w-96 -translate-x-1/2 rounded-full blur-3xl',
          currentTone.glow
        )}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 h-96 w-[680px] -translate-x-1/2 opacity-70"
        style={lightBeamStyle}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-72 left-0 h-28 w-full opacity-60"
        style={horizonMistStyle}
      />

      <div />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <div
          aria-hidden="true"
          className={cn(
            'select-none font-mono text-7xl font-black tracking-widest sm:text-8xl md:text-9xl',
            currentTone.code
          )}
          style={codeShadowStyle}
        >
          {code}
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>

        <p className="mt-3 max-w-md text-sm text-muted-foreground/80 sm:text-base">{description}</p>

        {detail ? (
          <div className="mt-4 max-w-lg rounded-md border border-border/60 bg-background/80 px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">
            {detail}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {actions.map(action => (
            <Button
              className={cn('min-w-24', action.className)}
              key={action.label}
              onClick={action.onClick}
              theme={
                action.variant === 'outline'
                  ? 'light'
                  : action.variant === 'ghost'
                    ? 'borderless'
                    : 'solid'
              }
              type={
                action.variant === 'outline' || action.variant === 'ghost' ? 'tertiary' : 'primary'
              }
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {footerLinks.length > 0 ? (
        <nav
          aria-label="状态页辅助链接"
          className="relative z-10 flex flex-wrap items-center justify-center gap-5 pt-12 text-sm text-muted-foreground/55"
        >
          {footerLinks.map((link, index) => (
            <span className="flex items-center gap-5" key={link}>
              {index > 0 ? <span className="h-3 w-px bg-border" aria-hidden="true" /> : null}
              <button
                className="hover:text-foreground border-0 bg-transparent cursor-pointer"
                type="button"
              >
                {link}
              </button>
            </span>
          ))}
        </nav>
      ) : null}
    </section>
  )
}
