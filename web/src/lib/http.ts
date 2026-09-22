import axios, { AxiosHeaders, type AxiosError, type AxiosRequestConfig } from 'axios'

import { runtimeEnv } from '@/config/env'

// 统一 HTTP 客户端：只处理传输、鉴权头和错误归一化，UI 提示交给调用层。
type ApiCode = number | string
type AccessTokenResolver = () => string | null | undefined
type TokenRefreshHandler = () => Promise<string | undefined>
type UnauthorizedHandler = (error: HttpError) => void
type SuccessCodePredicate = (code: ApiCode) => boolean
type InternalHttpRequestConfig = AxiosRequestConfig & {
  __retried?: boolean
  skipAuthRefresh?: boolean
}

// 兼容常见后端响应包裹格式：{ code/status, message, data }。
export interface ApiEnvelope<T> {
  code?: ApiCode
  data: T
  message?: string
  status?: ApiCode
}

export interface HttpConfig {
  getAccessToken?: AccessTokenResolver
  isSuccessCode?: SuccessCodePredicate
  onTokenRefresh?: TokenRefreshHandler
  onUnauthorized?: UnauthorizedHandler
}

export interface HttpErrorOptions {
  code?: ApiCode
  message: string
  payload?: unknown
  status?: number
}

export class HttpError extends Error {
  code?: ApiCode
  payload?: unknown
  status?: number

  constructor(options: HttpErrorOptions) {
    super(options.message)
    this.name = 'HttpError'
    this.code = options.code
    this.payload = options.payload
    this.status = options.status
  }
}

export type HttpRequestConfig = Omit<InternalHttpRequestConfig, 'method' | 'url'>

let accessTokenResolver: AccessTokenResolver | undefined
let tokenRefreshHandler: TokenRefreshHandler | undefined
let unauthorizedHandler: UnauthorizedHandler | undefined
let successCodePredicate: SuccessCodePredicate = code =>
  code === 0 || code === '0' || code === 200 || code === '200'

// 在应用启动或登录模块中注入 token 获取和 401 处理逻辑，避免 http 层直接依赖 store。
export function configureHttp(config: HttpConfig) {
  accessTokenResolver = config.getAccessToken
  tokenRefreshHandler = config.onTokenRefresh
  unauthorizedHandler = config.onUnauthorized

  if (config.isSuccessCode) {
    successCodePredicate = config.isSuccessCode
  }
}

const httpInstance = axios.create({
  baseURL: runtimeEnv.apiBaseUrl,
  headers: {
    'Content-Type': 'application/json;charset=utf-8'
  },
  timeout: 30_000
})

httpInstance.interceptors.request.use(config => {
  const token = accessTokenResolver?.()

  if (token) {
    config.headers = AxiosHeaders.from(config.headers)
    config.headers.set('Authorization', `Bearer ${token}`)
  }

  return config
})

httpInstance.interceptors.response.use(
  response => response,
  async (error: AxiosError<unknown>) => {
    const normalizedError = normalizeAxiosError(error)
    const config = error.config as InternalHttpRequestConfig | undefined

    if (
      normalizedError.status === 401 &&
      config &&
      !config.__retried &&
      !config.skipAuthRefresh &&
      tokenRefreshHandler
    ) {
      try {
        const token = await tokenRefreshHandler()

        if (token) {
          config.__retried = true
          return httpInstance.request(config)
        }
      } catch {
        // Fall through to the normal unauthorized handler below.
      }
    }

    if (normalizedError.status === 401) {
      unauthorizedHandler?.(normalizedError)
    }

    return Promise.reject(normalizedError)
  }
)

async function request<T>(config: InternalHttpRequestConfig): Promise<T> {
  const response = await httpInstance.request<unknown>(config)
  return unwrapResponse<T>(response.data, response.status)
}

// 后端包裹响应只把业务 data 暴露给 service/queryFn；非包裹响应按原样返回。
function unwrapResponse<T>(payload: unknown, httpStatus: number): T {
  if (!isApiEnvelope(payload)) {
    return payload as T
  }

  const code = getEnvelopeCode(payload)

  if (code === undefined || successCodePredicate(code)) {
    return payload.data as T
  }

  throw new HttpError({
    code,
    message: payload.message || 'Request failed',
    payload,
    status: httpStatus
  })
}

// 统一把网络/HTTP 错误转换成 HttpError，便于 QueryClient retry 判断。
function normalizeAxiosError(error: AxiosError<unknown>) {
  const payload = error.response?.data

  return new HttpError({
    code: getEnvelopeCode(payload),
    message: getErrorMessage(payload) || error.message || 'Request failed',
    payload,
    status: error.response?.status
  })
}

function getEnvelopeCode(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined
  }

  const code = payload.status ?? payload.code
  return typeof code === 'number' || typeof code === 'string' ? code : undefined
}

function getErrorMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined
  }

  return typeof payload.message === 'string' ? payload.message : undefined
}

function isApiEnvelope(payload: unknown): payload is ApiEnvelope<unknown> {
  return isRecord(payload) && 'data' in payload && ('status' in payload || 'code' in payload)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// service 层优先使用这些短方法；queryFn 中可把 TanStack Query 的 signal 放进 config。
export const http = {
  delete: <T>(url: string, config?: HttpRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
  get: <T>(url: string, config?: HttpRequestConfig) =>
    request<T>({ ...config, method: 'GET', url }),
  patch: <T>(url: string, data?: unknown, config?: HttpRequestConfig) =>
    request<T>({ ...config, data, method: 'PATCH', url }),
  post: <T>(url: string, data?: unknown, config?: HttpRequestConfig) =>
    request<T>({ ...config, data, method: 'POST', url }),
  put: <T>(url: string, data?: unknown, config?: HttpRequestConfig) =>
    request<T>({ ...config, data, method: 'PUT', url }),
  request
}
