declare module 'virtual:admin-project-info' {
  const projectInfo: import('@/types/project-info').ProjectInfo

  export { projectInfo }
  export default projectInfo
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_URL?: string
  readonly VITE_AUTH_REQUIRED?: string
  readonly VITE_BASE_URL?: string
  readonly VITE_USE_MOCK?: string
}
