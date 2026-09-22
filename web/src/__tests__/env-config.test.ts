import { describe, expect, it } from 'vitest'

import { createRuntimeEnv, parseBooleanEnv } from '@/config/env'

describe('runtime env config', () => {
  it('prefers VITE_API_URL and keeps the app base url explicit', () => {
    expect(
      createRuntimeEnv({
        BASE_URL: '/',
        VITE_API_BASE_URL: 'https://legacy.example.com',
        VITE_API_URL: 'https://api.example.com',
        VITE_BASE_URL: '/react-admin/'
      })
    ).toMatchObject({
      apiBaseUrl: 'https://api.example.com',
      appBaseUrl: '/react-admin/'
    })
  })

  it('defaults to the real API with the auth guard enabled', () => {
    expect(createRuntimeEnv({})).toMatchObject({
      apiBaseUrl: '/api',
      appBaseUrl: '/',
      authRequired: true
    })
  })

  it('parses common boolean env strings', () => {
    expect(parseBooleanEnv('false', true)).toBe(false)
    expect(parseBooleanEnv('0', true)).toBe(false)
    expect(parseBooleanEnv('true', false)).toBe(true)
    expect(parseBooleanEnv('1', false)).toBe(true)
    expect(parseBooleanEnv(undefined, true)).toBe(true)
  })
})
