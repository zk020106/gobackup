import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type PageProps = {
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  description?: ReactNode
  footer?: ReactNode
  footerClassName?: string
  headerClassName?: string
  style?: CSSProperties
  title?: ReactNode
}

export type PageSectionProps = {
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  description?: ReactNode
  footer?: ReactNode
  footerClassName?: string
  headerClassName?: string
  style?: CSSProperties
  title?: ReactNode
}

/**
 * 渲染页面内部容器，统一页面标题、说明、操作区、内容间距和底部区域。
 *
 * @param props - 组件属性。
 * @param props.actions - 页面标题右侧操作区。
 * @param props.children - 页面主体内容。
 * @param props.className - 页面根容器额外类名。
 * @param props.contentClassName - 页面主体区域额外类名。
 * @param props.description - 页面说明文案。
 * @param props.footer - 页面底部区域。
 * @param props.footerClassName - 页面底部区域额外类名。
 * @param props.headerClassName - 页面头部区域额外类名。
 * @param props.style - 页面根容器内联样式。
 * @param props.title - 页面标题。
 * @returns 页面内部布局容器。
 */
export function Page({
  actions,
  children,
  className,
  contentClassName,
  description,
  footer,
  footerClassName,
  headerClassName,
  style,
  title
}: PageProps) {
  const headerVisible = Boolean(title || description || actions)

  return (
    <div
      className={cn('relative flex min-h-full flex-col gap-4 p-4', className)}
      data-slot="page"
      style={style}
    >
      {headerVisible ? (
        <div
          className={cn(
            'flex flex-col gap-3 rounded-lg border bg-card px-4 py-4 md:flex-row md:items-end md:justify-between md:px-6',
            headerClassName
          )}
          data-slot="page-header"
        >
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="truncate text-lg leading-snug font-semibold" data-slot="page-title">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground" data-slot="page-description">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2" data-slot="page-actions">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn('grid gap-4', contentClassName)} data-slot="page-content">
        {children}
      </div>
      {footer ? (
        <div
          className={cn(
            'flex items-center rounded-lg border bg-card px-4 py-4 md:px-6',
            footerClassName
          )}
          data-slot="page-footer"
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 渲染页面区块布局，统一区块标题、说明、操作区、内容和底部区域。
 *
 * @param props - 组件属性。
 * @param props.actions - 区块标题右侧操作区。
 * @param props.children - 区块主体内容。
 * @param props.className - 区块根容器额外类名。
 * @param props.contentClassName - 区块主体区域额外类名。
 * @param props.description - 区块说明文案。
 * @param props.footer - 区块底部区域。
 * @param props.footerClassName - 区块底部区域额外类名。
 * @param props.headerClassName - 区块头部区域额外类名。
 * @param props.style - 区块根容器内联样式。
 * @param props.title - 区块标题。
 * @returns 页面区块布局容器。
 */
export function PageSection({
  actions,
  children,
  className,
  contentClassName,
  description,
  footer,
  footerClassName,
  headerClassName,
  style,
  title
}: PageSectionProps) {
  const headerVisible = Boolean(title || description || actions)
  const separated = Boolean(headerVisible || footer)

  return (
    <section
      className={cn('min-w-0', separated && 'grid gap-3', className)}
      data-slot="page-section"
      style={style}
    >
      {headerVisible ? (
        <div
          className={cn(
            'flex flex-col gap-2 md:flex-row md:items-end md:justify-between',
            headerClassName
          )}
          data-slot="page-section-header"
        >
          <div className="min-w-0 flex-1">
            {title ? (
              <h3
                className="truncate text-base leading-snug font-semibold"
                data-slot="page-section-title"
              >
                {title}
              </h3>
            ) : null}
            {description ? (
              <p
                className="mt-1 text-sm text-muted-foreground"
                data-slot="page-section-description"
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div
              className="flex shrink-0 flex-wrap items-center gap-2"
              data-slot="page-section-actions"
            >
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn('min-w-0', contentClassName)} data-slot="page-section-content">
        {children}
      </div>
      {footer ? (
        <div className={cn('min-w-0', footerClassName)} data-slot="page-section-footer">
          {footer}
        </div>
      ) : null}
    </section>
  )
}
