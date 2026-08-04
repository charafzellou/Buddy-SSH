// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useResize } from './useResize'

describe('useResize', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces resize events and sends the measured RESIZE payload', () => {
    vi.useFakeTimers()

    const element = document.createElement('div')
    const send = vi.fn()
    const observer = new FakeResizeObserver()

    useResize({
      element,
      transport: { send },
      measure: () => ({ cols: 120, rows: 40, pixelWidth: 1280, pixelHeight: 720 }),
      createObserver: (callback) => {
        observer.callback = callback
        return observer
      },
    })

    observer.trigger(element)
    observer.trigger(element)

    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(49)
    expect(send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      v: 1,
      type: 'RESIZE',
      payload: {
        cols: 120,
        rows: 40,
        pixelWidth: 1280,
        pixelHeight: 720,
      },
    })
  })
})

class FakeResizeObserver {
  callback: ResizeObserverCallback = () => {}

  observe(): void {}

  disconnect(): void {}

  trigger(element: Element): void {
    this.callback([{ target: element } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
}
