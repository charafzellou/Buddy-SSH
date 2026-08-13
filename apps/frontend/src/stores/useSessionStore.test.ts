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

  it('renames a tab, falling back to a default label when blank', () => {
    const store = useSessionStore()
    const tab = store.openTab({ label: 'alpha' })

    store.renameTab(tab.id, '  bravo  ')
    expect(store.activeTab?.label).toBe('bravo')

    store.renameTab(tab.id, '   ')
    expect(store.activeTab?.label).toBe('New Session')
  })

  it('toggles or sets a tab as pinned', () => {
    const store = useSessionStore()
    const tab = store.openTab({ label: 'alpha' })

    expect(store.activeTab?.pinned).toBe(false)

    store.pinTab(tab.id)
    expect(store.activeTab?.pinned).toBe(true)

    store.pinTab(tab.id)
    expect(store.activeTab?.pinned).toBe(false)

    store.pinTab(tab.id, true)
    expect(store.activeTab?.pinned).toBe(true)
  })

  it('duplicates a tab as an independent tab carrying profile/label/color', () => {
    const store = useSessionStore()
    const original = store.openTab({ label: 'alpha', profileId: 'profile-1', color: 'sky' })
    store.setTabTransport(original.id, { close: vi.fn() } as never)
    store.setTabState(original.id, 'connected')

    const duplicate = store.duplicateTab(original.id)

    expect(duplicate).not.toBeNull()
    expect(duplicate?.id).not.toBe(original.id)
    expect(duplicate?.label).toBe('alpha')
    expect(duplicate?.profileId).toBe('profile-1')
    expect(duplicate?.color).toBe('sky')
    expect(duplicate?.transport).toBeNull()
    expect(duplicate?.state).toBe('connecting')
    expect(store.tabs).toHaveLength(2)
    expect(store.activeTabId).toBe(duplicate?.id)

    expect(store.duplicateTab('missing-id')).toBeNull()
  })

  it('reconnects a tab by resetting state and re-opening its transport', async () => {
    const store = useSessionStore()
    const connect = vi.fn().mockResolvedValue(undefined)
    const tab = store.openTab({ label: 'alpha', transport: { connect } as never })
    store.setTabState(tab.id, 'disconnected')
    store.setTabError(tab.id, 'previous failure')

    store.reconnect(tab.id)

    expect(store.activeTab?.state).toBe('connecting')
    expect(store.activeTab?.error).toBeNull()
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('routes a failed reconnect through setTabError/setTabState', async () => {
    const store = useSessionStore()
    const connect = vi.fn().mockRejectedValue(new Error('dial failed'))
    const tab = store.openTab({ label: 'alpha', transport: { connect } as never })

    store.reconnect(tab.id)
    await Promise.resolve()
    await Promise.resolve()

    expect(store.activeTab?.state).toBe('error')
    expect(store.activeTab?.error).toBe('dial failed')
  })

  it('reconnects all tabs', () => {
    const store = useSessionStore()
    const connectA = vi.fn().mockResolvedValue(undefined)
    const connectB = vi.fn().mockResolvedValue(undefined)
    store.openTab({ label: 'alpha', transport: { connect: connectA } as never })
    store.openTab({ label: 'beta', transport: { connect: connectB } as never })

    store.reconnectAll()

    expect(connectA).toHaveBeenCalledTimes(1)
    expect(connectB).toHaveBeenCalledTimes(1)
  })

  it('reorders tabs to match the given id order, appending any tabs left out', () => {
    const store = useSessionStore()
    const first = store.openTab({ label: 'alpha' })
    const second = store.openTab({ label: 'beta' })
    const third = store.openTab({ label: 'gamma' })

    store.reorder([third.id, first.id])

    expect(store.tabs.map((tab) => tab.id)).toEqual([third.id, first.id, second.id])
  })
})
