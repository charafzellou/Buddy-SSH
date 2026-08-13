// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'

function dispatch(target: EventTarget, key: string, extra: Partial<KeyboardEventInit> = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, ...extra }),
  )
}

describe('useKeyboardShortcuts', () => {
  it('maps Ctrl+T to newTab', () => {
    const target = document.createElement('div')
    const handlers = {
      newTab: vi.fn(),
      closeActiveTab: vi.fn(),
      switchTab: vi.fn(),
      switchTabByIndex: vi.fn(),
      reconnectActiveTab: vi.fn(),
    }
    useKeyboardShortcuts(handlers, { target })

    dispatch(target, 't')

    expect(handlers.newTab).toHaveBeenCalledTimes(1)
  })

  it('maps Ctrl+W to closeActiveTab and Ctrl+R to reconnectActiveTab', () => {
    const target = document.createElement('div')
    const handlers = {
      newTab: vi.fn(),
      closeActiveTab: vi.fn(),
      switchTab: vi.fn(),
      switchTabByIndex: vi.fn(),
      reconnectActiveTab: vi.fn(),
    }
    useKeyboardShortcuts(handlers, { target })

    dispatch(target, 'w')
    dispatch(target, 'r')

    expect(handlers.closeActiveTab).toHaveBeenCalledTimes(1)
    expect(handlers.reconnectActiveTab).toHaveBeenCalledTimes(1)
  })

  it('maps Ctrl+Tab and Ctrl+Shift+Tab to switchTab next/previous', () => {
    const target = document.createElement('div')
    const handlers = {
      newTab: vi.fn(),
      closeActiveTab: vi.fn(),
      switchTab: vi.fn(),
      switchTabByIndex: vi.fn(),
      reconnectActiveTab: vi.fn(),
    }
    useKeyboardShortcuts(handlers, { target })

    dispatch(target, 'Tab')
    dispatch(target, 'Tab', { shiftKey: true })

    expect(handlers.switchTab).toHaveBeenNthCalledWith(1, 'next')
    expect(handlers.switchTab).toHaveBeenNthCalledWith(2, 'previous')
  })

  it('maps Ctrl+<digit> to switchTabByIndex (0-based)', () => {
    const target = document.createElement('div')
    const handlers = {
      newTab: vi.fn(),
      closeActiveTab: vi.fn(),
      switchTab: vi.fn(),
      switchTabByIndex: vi.fn(),
      reconnectActiveTab: vi.fn(),
    }
    useKeyboardShortcuts(handlers, { target })

    dispatch(target, '1')
    dispatch(target, '9')

    expect(handlers.switchTabByIndex).toHaveBeenNthCalledWith(1, 0)
    expect(handlers.switchTabByIndex).toHaveBeenNthCalledWith(2, 8)
  })

  it('ignores keys without a modifier and unmapped keys', () => {
    const target = document.createElement('div')
    const handlers = {
      newTab: vi.fn(),
      closeActiveTab: vi.fn(),
      switchTab: vi.fn(),
      switchTabByIndex: vi.fn(),
      reconnectActiveTab: vi.fn(),
    }
    useKeyboardShortcuts(handlers, { target })

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }))
    dispatch(target, 'k')

    expect(handlers.newTab).not.toHaveBeenCalled()
  })

  it('stops handling events after dispose', () => {
    const target = document.createElement('div')
    const handlers = {
      newTab: vi.fn(),
      closeActiveTab: vi.fn(),
      switchTab: vi.fn(),
      switchTabByIndex: vi.fn(),
      reconnectActiveTab: vi.fn(),
    }
    const handle = useKeyboardShortcuts(handlers, { target })

    handle.dispose()
    dispatch(target, 't')

    expect(handlers.newTab).not.toHaveBeenCalled()
  })
})
