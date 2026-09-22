import { useEffect } from 'react'
import NProgress from 'nprogress'

type PageTransitionProps = {
  routeKey: string
}

/**
 * 驱动页面切换时的顶部进度条。
 *
 * @param props - 组件属性。
 * @param props.routeKey - 当前路由标识，用于在路由变化时重启进度条。
 * @returns 页面切换进度条占位节点。
 */
export function PageTransitionProgress({ routeKey }: PageTransitionProps) {
  useEffect(() => {
    NProgress.configure({ showSpinner: false, trickleSpeed: 80 })
    NProgress.start()

    const timer = window.setTimeout(() => {
      NProgress.done()
    }, 320)

    return () => {
      window.clearTimeout(timer)
      NProgress.done(true)
    }
  }, [routeKey])

  return (
    <span
      aria-hidden="true"
      className="hidden"
      data-route-key={routeKey}
      data-slot="page-transition-progress"
    />
  )
}

/**
 * 渲染页面切换时的 loading 动画。
 *
 * @param props - 组件属性。
 * @param props.routeKey - 当前路由标识，用于保持切换动画和路由同步。
 * @returns 页面切换 loading 动画。
 */
export function PageTransitionLoading({ routeKey }: PageTransitionProps) {
  return (
    <div
      aria-hidden="true"
      className="admin-page-transition-loading"
      data-route-key={routeKey}
      data-slot="page-transition-loading"
    >
      <div className="admin-page-transition-spinner" />
    </div>
  )
}
