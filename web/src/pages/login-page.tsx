import { Navigate } from '@tanstack/react-router'
import { useStore } from 'zustand'

import { authStore } from '@/store/auth'
import { LoginPage } from './login/LoginPage'

export { LoginPage }

/** 登录路由入口：已登录用户访问 /login 时回跳首页。 */
export function LoginRoutePage() {
  const session = useStore(authStore, state => state.session)

  if (session) {
    return <Navigate replace to="/" />
  }

  return <LoginPage />
}
