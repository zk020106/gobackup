import { useEffect, useState } from 'react'

import { DrawerApi, ModalApi, type PopupState } from '@/utils/popup-api'

/** 订阅弹层 API 状态并映射为 React 状态。 */
export function usePopupState(api: ModalApi | DrawerApi) {
  const [state, setState] = useState<PopupState>(api.getState())

  useEffect(() => api.subscribe(next => setState(next)), [api])

  return state
}

/** 创建组件生命周期内稳定的 ModalApi；工厂仅首次渲染调用。 */
export function useModalApi(factory: () => ModalApi = () => new ModalApi()) {
  const [api] = useState(factory)

  return api
}

/** 创建组件生命周期内稳定的 DrawerApi；工厂仅首次渲染调用。 */
export function useDrawerApi(factory: () => DrawerApi = () => new DrawerApi()) {
  const [api] = useState(factory)

  return api
}
