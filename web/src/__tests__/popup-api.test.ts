import { describe, expect, it, vi } from 'vitest'

import { DrawerApi, ModalApi } from '@/utils/popup-api'

describe('popup api', () => {
  it('opens, closes, locks and shares modal payload', async () => {
    const onOpenChange = vi.fn()
    const api = new ModalApi({ onOpenChange, title: 'Edit user' })

    api.setData({ id: 12 }).open().lock()

    expect(api.getData()).toEqual({ id: 12 })
    expect(api.getState()).toEqual(
      expect.objectContaining({
        isOpen: true,
        submitting: true,
        title: 'Edit user'
      })
    )
    expect(onOpenChange).toHaveBeenCalledWith(true)

    await api.close()

    expect(api.getState().isOpen).toBe(false)
    expect(api.unlock().getState().submitting).toBe(false)
  })

  it('keeps drawer open when before-close denies closing and delegates cancel hooks', async () => {
    const onBeforeClose = vi.fn(() => false)
    const onCancel = vi.fn()
    const api = new DrawerApi({ onBeforeClose, onCancel, placement: 'left' })

    api.open()
    await api.close()
    api.onCancel()

    expect(api.getState()).toEqual(
      expect.objectContaining({
        isOpen: true,
        placement: 'left'
      })
    )
    expect(onBeforeClose).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
