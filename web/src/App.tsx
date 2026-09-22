import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'

import { queryClient } from '@/lib/query-client'
import { createAppRouter } from './router'

import '@/styles/globals.css'

// 组件：App。用于创建路由实例并挂载应用路由上下文。
export default function App() {
  const [router] = useState(() => createAppRouter())

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
