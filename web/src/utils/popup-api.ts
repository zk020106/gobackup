import { createStore, type StoreApi } from 'zustand/vanilla'

// 类型：BeforeClose。关闭前守卫返回 false 时阻止关闭。
type BeforeClose = () => boolean | Promise<boolean>
// 类型：PopupPlacement。限定抽屉可用的弹出方向。
type PopupPlacement = 'bottom' | 'left' | 'right' | 'top'

// 类型：PopupCallbacks。集中声明弹层生命周期回调。
interface PopupCallbacks {
  onBeforeClose?: BeforeClose
  onCancel?: () => void
  onClosed?: () => void
  onConfirm?: () => void
  onOpenChange?: (open: boolean) => void
  onOpened?: () => void
}

export interface PopupState {
  cancelText?: string
  confirmText?: string
  footer: boolean
  fullscreen?: boolean
  header: boolean
  isOpen: boolean
  loading: boolean
  placement?: PopupPlacement
  showCancelButton: boolean
  showConfirmButton: boolean
  submitting: boolean
  title: string
}

// 类型：PopupOptions。允许初始化状态和生命周期回调同时传入。
type PopupOptions = Partial<PopupState> & PopupCallbacks

const DEFAULT_MODAL_STATE: PopupState = {
  footer: true,
  fullscreen: false,
  header: true,
  isOpen: false,
  loading: false,
  showCancelButton: true,
  showConfirmButton: true,
  submitting: false,
  title: ''
}

const DEFAULT_DRAWER_STATE: PopupState = {
  footer: true,
  header: true,
  isOpen: false,
  loading: false,
  placement: 'right',
  showCancelButton: true,
  showConfirmButton: true,
  submitting: false,
  title: ''
}

// 类：PopupApi。管理弹窗/抽屉的状态、数据和生命周期回调。
class PopupApi {
  protected callbacks: PopupCallbacks
  protected data: unknown = {}
  protected store: StoreApi<PopupState>

  // 方法：constructor。合并默认状态和调用方配置，并订阅显隐变化。
  constructor(defaultState: PopupState, options: PopupOptions = {}) {
    const { onBeforeClose, onCancel, onClosed, onConfirm, onOpenChange, onOpened, ...state } =
      options

    this.callbacks = {
      onBeforeClose,
      onCancel,
      onClosed,
      onConfirm,
      onOpenChange,
      onOpened
    }
    this.store = createStore<PopupState>()(() => ({ ...defaultState, ...state }))
    this.store.subscribe((next, previous) => {
      if (next.isOpen !== previous.isOpen) {
        // 调用方常把弹层显隐同步到路由或查询状态。
        this.callbacks.onOpenChange?.(next.isOpen)
      }
    })
  }

  // 方法：close。执行关闭前守卫，通过后关闭弹层。
  async close() {
    // 带守卫的关闭逻辑支持未保存提示，同时避免 UI 组件耦合到状态仓库。
    const allowClose = (await this.callbacks.onBeforeClose?.()) ?? true

    if (allowClose) {
      this.setState({ isOpen: false, submitting: false })
    }

    return this
  }

  // 方法：getData。读取弹层携带的数据。
  // 类型参数：T 表示调用方期望取回的数据形状，默认 unknown。
  getData<T = unknown>() {
    return this.data as T
  }

  // 方法：getState。读取弹层当前状态。
  getState() {
    return this.store.getState()
  }

  // 方法：lock。进入提交中状态，通常用于禁用关闭或按钮。
  lock() {
    return this.setState({ submitting: true })
  }

  // 方法：onCancel。触发取消回调；未提供回调时执行默认关闭。
  onCancel() {
    if (this.callbacks.onCancel) {
      this.callbacks.onCancel()
      return this
    }

    void this.close()
    return this
  }

  // 方法：onClosed。弹层关闭后触发关闭完成回调。
  onClosed() {
    if (!this.getState().isOpen) {
      this.callbacks.onClosed?.()
    }
    return this
  }

  // 方法：onConfirm。触发确认回调。
  onConfirm() {
    this.callbacks.onConfirm?.()
    return this
  }

  // 方法：onOpened。弹层打开后触发打开完成回调。
  onOpened() {
    if (this.getState().isOpen) {
      this.callbacks.onOpened?.()
    }
    return this
  }

  // 方法：open。打开弹层并清理提交状态。
  open() {
    return this.setState({ isOpen: true, submitting: false })
  }

  // 方法：setData。写入弹层携带的数据。
  // 类型参数：T 表示本次写入的数据形状。
  setData<T>(payload: T) {
    this.data = payload
    return this
  }

  // 方法：setState。合并状态补丁或基于当前状态计算补丁。
  setState(stateOrUpdater: ((state: PopupState) => Partial<PopupState>) | Partial<PopupState>) {
    // 对齐 React 风格的状态更新器，调用方可基于当前状态生成补丁。
    const patch =
      typeof stateOrUpdater === 'function' ? stateOrUpdater(this.store.getState()) : stateOrUpdater

    this.store.setState(state => ({ ...state, ...patch }))
    return this
  }

  // 方法：subscribe。订阅弹层状态变化。
  subscribe(listener: (state: PopupState, previousState: PopupState) => void) {
    return this.store.subscribe(listener)
  }

  // 方法：unlock。退出提交中状态。
  unlock() {
    return this.setState({ submitting: false })
  }
}

// 类：ModalApi。使用模态弹窗默认状态的弹层 API。
export class ModalApi extends PopupApi {
  // 方法：constructor。创建模态弹窗 API。
  constructor(options: PopupOptions = {}) {
    super(DEFAULT_MODAL_STATE, options)
  }
}

// 类：DrawerApi。使用抽屉默认状态的弹层 API。
export class DrawerApi extends PopupApi {
  // 方法：constructor。创建抽屉 API。
  constructor(options: PopupOptions = {}) {
    super(DEFAULT_DRAWER_STATE, options)
  }
}
