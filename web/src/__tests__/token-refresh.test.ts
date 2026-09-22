import { describe, expect, it, vi } from 'vitest'

import { createTokenRefreshQueue } from '@/auth/token-refresh'

describe('token refresh queue', () => {
  it('coalesces concurrent refresh calls into one request', async () => {
    const refresh = vi.fn(async () => 'new-token')
    const queue = createTokenRefreshQueue({ refresh })

    const [first, second] = await Promise.all([queue.getFreshToken(), queue.getFreshToken()])

    expect(first).toBe('new-token')
    expect(second).toBe('new-token')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('allows a new refresh after the previous one settles', async () => {
    const refresh = vi.fn(async () => 'new-token')
    const queue = createTokenRefreshQueue({ refresh })

    await queue.getFreshToken()
    await queue.getFreshToken()

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('propagates refresh failure to all waiters and clears the in-flight slot', async () => {
    const error = new Error('refresh failed')
    const refresh = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('retried-token')
    const queue = createTokenRefreshQueue({ refresh })

    const first = queue.getFreshToken()
    const second = queue.getFreshToken()

    await expect(first).rejects.toThrow(error)
    await expect(second).rejects.toThrow(error)
    await expect(queue.getFreshToken()).resolves.toBe('retried-token')
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
