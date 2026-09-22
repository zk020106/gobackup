import { Moon, Sun } from 'lucide-react'
import { Tooltip } from '@douyinfe/semi-ui-19'

import { cn } from '@/lib/utils'

export type LoginThemeMode = 'dark' | 'light'

interface ThemeToggleProps {
  onToggle: () => void
  themeMode: LoginThemeMode
}

const iconButtonClass =
  'inline-flex size-10 items-center justify-center rounded-full border border-slate-200/70 bg-white/55 text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-md transition-all duration-[250ms] hover:-translate-y-px hover:bg-white/80 hover:text-blue-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:shadow-none dark:hover:bg-white/[0.11] dark:hover:text-white cursor-pointer'

export function ThemeToggle({ onToggle, themeMode }: ThemeToggleProps) {
  const isDark = themeMode === 'dark'

  return (
    <Tooltip content={isDark ? '切换为亮色模式' : '切换为暗黑模式'}>
      <button
        aria-label={isDark ? '切换为亮色模式' : '切换为暗黑模式'}
        className={cn(iconButtonClass)}
        onClick={onToggle}
        type="button"
      >
        {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </button>
    </Tooltip>
  )
}
