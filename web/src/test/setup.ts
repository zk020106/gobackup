import '@testing-library/jest-dom/vitest'
// 与 main.tsx 保持一致：Semi 的命令式接口（Toast 等）在 React 19 下需要先注入
// createRoot，否则调用会被静默忽略，测试也就测不到真实的提示行为。
import '@douyinfe/semi-ui-19/react19-adapter'
import { configure } from '@testing-library/react'
import { vi } from 'vitest'

// jsdom 下重组件（Semi UI 整页 + 虚拟列表）渲染要几秒，默认 1s 的 findBy*/waitFor
// 超时在整套用例并行执行时容易误报失败，这里统一放宽。
configure({ asyncUtilTimeout: 5000 })

// 适配 React 19 testing-library act 环境
// @ts-expect-error global react act definition
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// 适配 Semi Design / lottie-web 在 jsdom 下的 canvas 依赖
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => ({
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    createImageData: vi.fn(() => []),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    moveTo: vi.fn(),
    putImageData: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    transform: vi.fn(),
    translate: vi.fn()
  }))
}

// 适配 Semi Design Typography 文本截断/溢出计算在 jsdom 下的 Range 依赖
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => {}
    })
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      ({
        item: () => null,
        length: 0,
        [Symbol.iterator]: function* () {}
      }) as unknown as DOMRectList
  }
}

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn()
  })),
  writable: true
})

class ResizeObserverMock {
  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, 'ResizeObserver', {
  value: ResizeObserverMock,
  writable: true
})

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverMock,
  writable: true
})

if (!HTMLElement.prototype.hasPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    value: vi.fn(() => false),
    writable: true
  })
}

if (!HTMLElement.prototype.setPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    value: vi.fn(),
    writable: true
  })
}

if (!HTMLElement.prototype.releasePointerCapture) {
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    value: vi.fn(),
    writable: true
  })
}

if (!HTMLElement.prototype.scrollIntoView) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: vi.fn(),
    writable: true
  })
}

Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true
})

const getComputedStyleWithoutPseudo = window.getComputedStyle.bind(window)

Object.defineProperty(window, 'getComputedStyle', {
  value: (element: Element) => getComputedStyleWithoutPseudo(element),
  writable: true
})

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn()
  },
  writable: true
})
