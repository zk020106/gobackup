import { ChevronDown, Globe2 } from 'lucide-react'
import { Tooltip } from '@douyinfe/semi-ui-19'

import { cn } from '@/lib/utils'
import { GithubMark } from './GithubMark'
import { ThemeToggle, type LoginThemeMode } from './ThemeToggle'

type LoginLanguage = 'en-US' | 'zh-CN'

interface LoginToolbarProps {
  language: LoginLanguage
  onGithubClick: () => void
  onThemeToggle: () => void
  onToggleLanguage: () => void
  themeMode: LoginThemeMode
}

const iconButtonClass =
  'inline-flex size-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-slate-700 shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-px hover:border-[#07bdfd]/50 hover:bg-white/90 hover:text-[#006be6] hover:shadow-[0_0_12px_rgba(7,189,253,0.2)] dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:shadow-none dark:hover:border-[#07bdfd]/50 dark:hover:bg-white/[0.12] dark:hover:text-[#07bdfd] cursor-pointer'

export function LoginToolbar({
  language,
  onGithubClick,
  onThemeToggle,
  onToggleLanguage,
  themeMode
}: LoginToolbarProps) {
  const languageLabel = language === 'zh-CN' ? '简体中文' : 'English'

  return (
    <div className="flex w-full min-w-0 items-center justify-end gap-2.5">
      <Tooltip content="切换语言">
        <button
          aria-label="切换语言"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/60 px-3 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-px hover:border-[#07bdfd]/50 hover:bg-white/90 hover:text-[#006be6] hover:shadow-[0_0_12px_rgba(7,189,253,0.2)] dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:shadow-none dark:hover:border-[#07bdfd]/50 dark:hover:bg-white/[0.12] dark:hover:text-[#07bdfd] cursor-pointer"
          onClick={onToggleLanguage}
          type="button"
        >
          <Globe2 className="size-4" />
          <span className="hidden sm:inline">{languageLabel}</span>
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </Tooltip>
      <ThemeToggle onToggle={onThemeToggle} themeMode={themeMode} />
      <Tooltip content="GitHub 仓库">
        <button
          aria-label="打开 GitHub"
          className={cn(iconButtonClass)}
          onClick={onGithubClick}
          type="button"
        >
          <GithubMark className="size-4" />
        </button>
      </Tooltip>
    </div>
  )
}
