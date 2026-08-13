// @vitest-environment jsdom

import { useSessionStore } from '@/stores/useSessionStore'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import QuickConnectDialog from './QuickConnectDialog.vue'

describe('QuickConnectDialog', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    setActivePinia(createPinia())
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  it('parses valid input and opens a tab on submit (password auth)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSessionStore()
    const openTab = vi.spyOn(store, 'openTab')
    const onConnect = vi.fn()

    const app = createApp(QuickConnectDialog, { open: true, onConnect })
    app.use(pinia)
    app.mount(root)

    const inputs = root.querySelectorAll('input')
    const destination = inputs[0] as HTMLInputElement
    const password = inputs[1] as HTMLInputElement
    destination.value = 'ops@example.com:22'
    destination.dispatchEvent(new Event('input'))
    password.value = 'top-secret'
    password.dispatchEvent(new Event('input'))

    root
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    expect(openTab).toHaveBeenCalledWith({
      label: 'ops@example.com',
      state: 'connecting',
    })
    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'ops',
        host: 'example.com',
        port: 22,
        authMethod: 'password',
        password: 'top-secret',
      }),
    )
    app.unmount()
  })

  it('switches to publickey auth: no password required, payload carries authMethod', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const onConnect = vi.fn()

    const app = createApp(QuickConnectDialog, { open: true, onConnect })
    app.use(pinia)
    app.mount(root)

    const destination = root.querySelector('input') as HTMLInputElement
    destination.value = 'ops@example.com:22'
    destination.dispatchEvent(new Event('input'))

    const radios = root.querySelectorAll('[role="radio"]')
    ;(radios[1] as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(root.querySelector('input[type="password"]')).toBeNull()

    root
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({ authMethod: 'publickey', password: undefined }),
    )
    app.unmount()
  })

  it('shows an error for invalid input', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSessionStore()
    const openTab = vi.spyOn(store, 'openTab')

    const app = createApp(QuickConnectDialog, { open: true })
    app.use(pinia)
    app.mount(root)

    const destination = root.querySelector('input') as HTMLInputElement
    destination.value = 'invalid-target'
    destination.dispatchEvent(new Event('input'))

    root
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    expect(openTab).not.toHaveBeenCalled()
    expect(root.textContent).toContain('Enter a destination as user@host:port')
    app.unmount()
  })
})
