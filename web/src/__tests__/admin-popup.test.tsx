import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AdminDrawer } from '@/components/admin/popup/admin-drawer'
import { AdminModal } from '@/components/admin/popup/admin-modal'
import { DrawerApi, ModalApi } from '@/utils/popup-api'

describe('admin modal', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens with title and payload content', async () => {
    const api = new ModalApi({ title: '新增用户' })

    render(<AdminModal api={api}>表单内容</AdminModal>)
    act(() => {
      api.setData({ id: 'user-root' }).open()
    })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('新增用户')).toBeInTheDocument()
    expect(screen.getByText('表单内容')).toBeInTheDocument()
    expect(api.getData<{ id: string }>().id).toBe('user-root')
  })

  it('blocks closing when onBeforeClose returns false', async () => {
    const api = new ModalApi({ onBeforeClose: () => false, title: '受守卫弹窗' })

    render(<AdminModal api={api} />)
    act(() => {
      api.open()
    })

    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: /取\s*消|Cancel/ }))

    expect(api.getState().isOpen).toBe(true)
  })

  it('marks the confirm button as loading while submitting', async () => {
    const api = new ModalApi({ title: '提交中弹窗' })

    render(<AdminModal api={api} />)
    act(() => {
      api.open()
      api.lock()
    })

    await screen.findByRole('dialog')

    await waitFor(() => {
      expect(document.querySelector('.semi-button-loading, .ant-btn-loading')).not.toBeNull()
    })
  })

  it('invokes the custom confirm handler from the ok button', async () => {
    const onConfirm = vi.fn()
    const api = new ModalApi({ title: '确认弹窗' })

    render(<AdminModal api={api} onConfirm={onConfirm} />)
    act(() => {
      api.open()
    })

    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: /确\s*定|OK/ }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('admin drawer', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens with footer confirm and cancel actions', async () => {
    const onConfirm = vi.fn()
    const api = new DrawerApi({ title: '抽屉表单' })

    render(
      <AdminDrawer api={api} onConfirm={onConfirm}>
        抽屉内容
      </AdminDrawer>
    )
    act(() => {
      api.open()
    })

    expect(await screen.findByText('抽屉内容')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /确\s*定/ }))

    expect(onConfirm).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /取\s*消/ }))

    await waitFor(() => {
      expect(api.getState().isOpen).toBe(false)
    })
  })
})
