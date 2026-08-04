import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './useSessionStore'

describe('useSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('opens tabs, switches the active tab, and closes tabs', () => {
    const store = useSessionStore()
    const close = vi.fn()

    const firstTab = store.openTab({ label: 'alpha' })
    const secondTab = store.openTab({
      label: 'beta',
      transport: { close } as never,
      state: 'connected',
    })

    expect(store.tabs).toHaveLength(2)
    expect(store.activeTabId).toBe(secondTab.id)
    expect(store.activeTab?.label).toBe('beta')

    store.setActive(firstTab.id)
    expect(store.activeTabId).toBe(firstTab.id)
    expect(store.activeTab?.label).toBe('alpha')

    store.closeTab(firstTab.id)
    expect(store.tabs).toHaveLength(1)
    expect(store.activeTabId).toBe(secondTab.id)

    store.closeTab(secondTab.id)
    expect(close).toHaveBeenCalledTimes(1)
    expect(store.tabs).toHaveLength(0)
    expect(store.activeTabId).toBeNull()
  })

  it('updates transport, state, error, and activity for a tab', () => {
    const store = useSessionStore()
    const tab = store.openTab({ label: 'alpha', state: 'connecting' })
    const transport = { close: vi.fn() } as never

    store.setTabTransport(tab.id, transport)
    store.setTabState(tab.id, 'connected')
    store.setTabError(tab.id, 'boom')
    store.touchTab(tab.id, 1234)

    expect(store.activeTab?.transport).toEqual(transport)
    expect(store.activeTab?.state).toBe('connected')
    expect(store.activeTab?.error).toBe('boom')
    expect(store.activeTab?.lastActivity).toBe(1234)
  })
})
