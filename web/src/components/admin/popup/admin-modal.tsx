import { Modal } from '@douyinfe/semi-ui-19'
import type { ReactNode } from 'react'

import type { ModalApi } from '@/utils/popup-api'
import { usePopupState } from './use-popup'

/** PopupApi 驱动的模态弹窗：submitting 映射确认按钮 loading，关闭统一走 beforeClose 守卫。 */
export function AdminModal({
  api,
  children,
  onConfirm,
  width
}: {
  api: ModalApi
  children?: ReactNode
  forceRender?: boolean
  onConfirm?: () => void
  width?: number | string
}) {
  const state = usePopupState(api)
  const footerProps = state.footer ? {} : { footer: null }

  return (
    <Modal
      afterClose={() => api.onClosed()}
      cancelButtonProps={{ 'aria-label': state.cancelText ?? '取消' }}
      cancelText={state.cancelText ?? '取消'}
      confirmLoading={state.submitting}
      hasCancel={state.showCancelButton}
      okButtonProps={{ 'aria-label': state.confirmText ?? '确定' }}
      okText={state.confirmText ?? '确定'}
      {...footerProps}
      onCancel={() => {
        api.onCancel()
      }}
      onOk={() => {
        if (onConfirm) {
          onConfirm()
        } else {
          api.onConfirm()
        }
      }}
      visible={state.isOpen}
      title={state.title}
      width={width}
    >
      {children}
    </Modal>
  )
}
