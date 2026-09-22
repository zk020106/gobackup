type EnvValue = boolean | number | string | undefined
type EnvSource = Record<string, EnvValue>

export interface RuntimeEnv {
  apiBaseUrl: string
  appBaseUrl: string
  authRequired: boolean
}

export function parseBooleanEnv(value: EnvValue, fallback: boolean) {
  if (value === undefined) {
    return fallback
  }

  const normalized = String(value).trim().toLowerCase()

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return fallback
}

export function createRuntimeEnv(env: EnvSource = import.meta.env): RuntimeEnv {
  return {
    apiBaseUrl: readString(env.VITE_API_URL) ?? readString(env.VITE_API_BASE_URL) ?? '/api',
    appBaseUrl: readString(env.VITE_BASE_URL) ?? readString(env.BASE_URL) ?? '/',
    authRequired: parseBooleanEnv(env.VITE_AUTH_REQUIRED, true)
  }
}

function readString(value: EnvValue) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const runtimeEnv = createRuntimeEnv()
