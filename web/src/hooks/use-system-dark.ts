import { useEffect, useState } from 'react'

// 函数：readSystemDarkPreference。读取系统颜色方案的当前值。
function readSystemDarkPreference() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 订阅系统颜色方案，返回当前是否偏好暗色。 */
export function useSystemDark() {
  const [systemDark, setSystemDark] = useState(readSystemDarkPreference)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    // 函数：handleChange。把系统颜色方案变化同步到组件状态。
    function handleChange() {
      setSystemDark(mediaQuery.matches)
    }

    handleChange()
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return systemDark
}
