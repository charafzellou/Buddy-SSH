// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { useSessionStore } from '@/stores/useSessionStore'
import TabBar from './TabBar.vue'

describe('TabBar', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  it('shows the empty state when there are no tabs', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const app = createApp(TabBar)
    app.use(pinia)
    app.mount(root)

    expect(root.textContent).toContain('Open a quick-connect session to start a terminal.')
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(0)

    app.unmount()
  })

  it('renders a tab per open session and switches the active tab on click', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSessionStore()
    const first = store.openTab({ label: 'alpha' })
    const second = store.openTab({ label: 'beta' })

    const app = createApp(TabBar)
    app.use(pinia)
    app.mount(root)
    await nextTick()

    const tabs = root.querySelectorAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(store.activeTabId).toBe(second.id)

    tabs[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(store.activeTabId).toBe(first.id)

    app.unmount()
  })

  it('pins and closes a tab via TabItem controls', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSessionStore()
    const close = vi.fn()
    const tab = store.openTab({ label: 'alpha', transport: { close } as never })

    const app = createApp(TabBar)
    app.use(pinia)
    app.mount(root)
    await nextTick()

    const buttons = root.querySelectorAll('button')
    buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(store.tabs.find((candidate) => candidate.id === tab.id)?.pinned).toBe(true)

    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(close).toHaveBeenCalledTimes(1)
    expect(store.tabs).toHaveLength(0)

    app.unmount()
  })

  it('reorders tabs by dragging one onto another', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSessionStore()
    const first = store.openTab({ label: 'alpha' })
    const second = store.openTab({ label: 'beta' })
    const third = store.openTab({ label: 'gamma' })

    const app = createApp(TabBar)
    app.use(pinia)
    app.mount(root)
    await nextTick()

    const tabs = root.querySelectorAll('[role="tab"]')
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue(third.id),
      effectAllowed: '',
    }

    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true })
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer })
    tabs[2]?.dispatchEvent(dragStart)

    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
    tabs[0]?.dispatchEvent(drop)

    expect(store.tabs.map((tab) => tab.id)).toEqual([third.id, first.id, second.id])

    app.unmount()
  })
})
