import { Outlet } from '@tanstack/react-router'
import { Suspense, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { usePreferencesSlice } from '@/store/use-preferences'

/** 渲染后台内容区容器，承载路由出口与懒加载兜底骨架。 */
export function PageSurface({
  activePath,
  children
}: {
  activePath: string
  children?: ReactNode
}) {
  const { contentCompact, contentCompactWidth } = usePreferencesSlice(preferences => ({
    contentCompact: preferences.contentCompact,
    contentCompactWidth: preferences.contentCompactWidth
  }))
  const compactContent = contentCompact === 'compact'

  return (
    <div
      className={cn('flex w-full flex-col gap-4', compactContent && 'mx-auto')}
      data-route-key={activePath}
      data-slot="page-surface"
      style={compactContent ? { maxWidth: contentCompactWidth } : undefined}
    >
      <Suspense fallback={<PageSurfaceFallback />}>{children ?? <Outlet />}</Suspense>
    </div>
  )
}

/** 渲染页面懒加载期间的骨架占位。 */
function PageSurfaceFallback() {
  return (
    <div className="grid gap-4" data-slot="page-surface-fallback">
      <div className="h-24 rounded-lg border bg-muted/40" />
      <div className="h-40 rounded-lg border bg-muted/30" />
    </div>
  )
}
