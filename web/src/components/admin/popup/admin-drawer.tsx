import { Button, SideSheet } from '@douyinfe/semi-ui-19'
import type { ReactNode } from 'react'

import type { DrawerApi } from '@/utils/popup-api'
import { usePopupState } from './use-popup'

/** PopupApi 驱动的抽屉：placement、footer、submitting 全部来自弹层状态机。 */
export function AdminDrawer({
  api,
  children,
  onConfirm,
  width
}: {
  api: DrawerApi
  children?: ReactNode
  onConfirm?: () => void
  width?: number | string
}) {
  const state = usePopupState(api)

  return (
    <SideSheet
      footer={
        state.footer ? (
          <div className="flex justify-end gap-2 p-4 border-t">
            {state.showCancelButton ? (
              <Button onClick={() => api.onCancel()} theme="borderless" type="tertiary">
                {state.cancelText ?? '取消'}
              </Button>
            ) : null}
            {state.showConfirmButton ? (
              <Button
                loading={state.submitting}
                onClick={() => (onConfirm ? onConfirm() : api.onConfirm())}
                theme="solid"
                type="primary"
              >
                {state.confirmText ?? '确定'}
              </Button>
            ) : null}
          </div>
        ) : null
      }
      onCancel={() => void api.close()}
      visible={state.isOpen}
      placement={state.placement as any}
      title={state.title}
      width={width}
    >
      <div className="p-4">{children}</div>
    </SideSheet>
  )
}
