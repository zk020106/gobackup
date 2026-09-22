import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useStore } from 'zustand'
import { Button, Form, Toast } from '@douyinfe/semi-ui-19'
import type { FormApi } from '@douyinfe/semi-ui-19/lib/es/form'
import { Lock, TriangleAlert, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { authApi } from '@/api/auth'
import { useSystemDark } from '@/hooks/use-system-dark'
import { cn } from '@/lib/utils'
import { navigationKeys, notificationKeys } from '@/lib/query-keys'
import { authStore } from '@/store/auth'
import { preferenceStore } from '@/store/preferences'
import { applyAdminTheme } from '@/theme'
import type { AdminPreferences } from '@/types'
import { AppLogo } from '@/components/app-logo'
import { LoginToolbar } from './LoginToolbar'
import type { LoginThemeMode } from './ThemeToggle'

interface LoginValues {
  password: string
  remember: boolean
  username: string
}

type LoginLanguage = 'en-US' | 'zh-CN'

function resolveLoginThemeMode(
  colorMode: AdminPreferences['colorMode'],
  systemDark: boolean
): LoginThemeMode {
  if (colorMode === 'system') {
    return systemDark ? 'dark' : 'light'
  }

  return colorMode
}

export function LoginPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const preferences = useStore(preferenceStore, state => state.preferences)
  const setPreferences = useStore(preferenceStore, state => state.setPreferences)
  const systemDark = useSystemDark()
  const [language, setLanguage] = useState<LoginLanguage>('zh-CN')
  const formApiRef = useRef<FormApi<LoginValues> | null>(null)

  const themeMode = resolveLoginThemeMode(preferences.colorMode, systemDark)
  const isDark = themeMode === 'dark'

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: session => {
      authStore.getState().setSession(session)
      void queryClient.invalidateQueries({ queryKey: navigationKeys.all })
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      Toast.success('登录成功')
      void navigate({ to: '/' })
    }
  })

  const errorMessage =
    loginMutation.error instanceof Error ? loginMutation.error.message : undefined

  useEffect(() => {
    applyAdminTheme({
      builtinType: preferences.themeBuiltinType,
      colorDestructive: preferences.themeColorDestructive,
      colorPrimary: preferences.themeColorPrimary,
      colorSuccess: preferences.themeColorSuccess,
      colorWarning: preferences.themeColorWarning,
      fontSize: preferences.themeFontSize,
      mode: preferences.colorMode === 'system' ? 'auto' : preferences.colorMode,
      radius: preferences.themeRadius,
      semiDarkHeader: preferences.themeSemiDarkHeader,
      semiDarkSidebar: preferences.themeSemiDarkSidebar,
      semiDarkSidebarSub: preferences.themeSemiDarkSidebarSub
    })

    const root = document.documentElement
    root.dataset.loginTheme = themeMode

    return () => {
      delete root.dataset.loginTheme
    }
  }, [
    preferences.colorMode,
    preferences.themeBuiltinType,
    preferences.themeColorDestructive,
    preferences.themeColorPrimary,
    preferences.themeColorSuccess,
    preferences.themeColorWarning,
    preferences.themeFontSize,
    preferences.themeRadius,
    preferences.themeSemiDarkHeader,
    preferences.themeSemiDarkSidebar,
    preferences.themeSemiDarkSidebarSub,
    themeMode
  ])

  function handleAccountFinish(values: LoginValues) {
    loginMutation.mutate({
      password: values.password,
      username: values.username
    })
  }

  function handleThemeToggle() {
    const nextMode = isDark ? 'light' : 'dark'
    setPreferences({ colorMode: nextMode })
  }

  function handleLanguageToggle() {
    setLanguage(prev => (prev === 'zh-CN' ? 'en-US' : 'zh-CN'))
  }

  function handleGithubClick() {
    window.open('https://github.com/zk020106/gobackup', '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={cn(
        'relative flex min-h-screen w-full flex-col justify-between overflow-hidden',
        'bg-[#f8fafc] text-slate-800 transition-colors duration-300',
        'dark:bg-[#090d16] dark:text-slate-200'
      )}
    >
      {/* 极简高级环境光背景 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* 光晕 1 */}
        <div
          className={cn(
            'absolute -top-[20%] left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full blur-[120px] transition-all duration-500',
            'bg-gradient-to-b from-blue-400/15 via-cyan-400/10 to-transparent',
            'dark:from-blue-600/20 dark:via-[#07bdfd]/12 dark:to-transparent'
          )}
        />
        {/* 光晕 2 */}
        <div
          className={cn(
            'absolute -bottom-[20%] left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full blur-[140px] opacity-70',
            'bg-gradient-to-t from-indigo-400/10 to-transparent',
            'dark:from-indigo-600/15 dark:to-transparent'
          )}
        />
        {/* 细微网格纹理 */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      {/* 顶栏 */}
      <header className="relative z-20 flex h-16 w-full items-center justify-between px-6 sm:px-10">
        <div className="flex items-center gap-2.5">
          <AppLogo size="md" />
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
            GoBackup
          </span>
        </div>

        <LoginToolbar
          language={language}
          onGithubClick={handleGithubClick}
          onThemeToggle={handleThemeToggle}
          onToggleLanguage={handleLanguageToggle}
          themeMode={themeMode}
        />
      </header>

      {/* 核心登录卡片区 */}
      <main className="relative z-20 mx-auto my-auto flex w-full max-w-[420px] flex-col items-center px-4 py-6">
        <div
          className={cn(
            'w-full rounded-2xl border p-8 transition-all duration-300',
            // 亮色高质感
            'border-slate-200/80 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl',
            // 暗色高质感
            'dark:border-white/[0.08] dark:bg-[#111624]/80 dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)]'
          )}
        >
          {/* 标题区 */}
          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              登录系统
            </h1>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              请输入您的账号与密码以继续
            </p>
          </div>

          {/* 账号密码表单 */}
          <Form<LoginValues>
            className="space-y-4"
            getFormApi={api => {
              formApiRef.current = api
            }}
            initValues={{ password: '', remember: true, username: '' }}
            onSubmit={handleAccountFinish}
          >
              {() => (
                <>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      账号
                    </label>
                    <Form.Input
                      autoFocus
                      className="!h-10 !rounded-lg"
                      field="username"
                      noLabel
                      placeholder="用户名 / 邮箱"
                      prefix={<User className="size-4 text-slate-400" />}
                      rules={[{ required: true, message: '请输入用户名' }]}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        密码
                      </label>
                    </div>
                    <Form.Input
                      className="!h-10 !rounded-lg"
                      field="password"
                      mode="password"
                      noLabel
                      placeholder="密码"
                      prefix={<Lock className="size-4 text-slate-400" />}
                      rules={[{ required: true, message: '请输入密码' }]}
                    />
                  </div>

                  <div className="pt-1">
                    <Form.Checkbox field="remember" noLabel>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        保持登录状态
                      </span>
                    </Form.Checkbox>
                  </div>

                  {errorMessage && (
                    <div
                      className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300"
                      role="alert"
                    >
                      <TriangleAlert className="size-3.5 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <Button
                    block
                    className="!h-10 !rounded-lg !text-sm font-medium !bg-blue-600 hover:!bg-blue-700 dark:!bg-[#006be6] dark:hover:!bg-[#005bb5] !text-white shadow-sm transition-all"
                    htmlType="submit"
                    loading={loginMutation.isPending}
                    theme="solid"
                    type="primary"
                  >
                    登录
                  </Button>
                </>
              )}
          </Form>
        </div>
      </main>

      {/* 极简页脚 */}
      <footer className="relative z-20 pb-6 text-center text-xs text-slate-400 dark:text-slate-500">
        © 2026 GoBackup
      </footer>
    </div>
  )
}
