// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, nextTick } from 'vue'
import { useSessionStore } from '@/stores/useSessionStore'
import WorkspaceView from './WorkspaceView.vue'

const transportMocks = vi.hoisted(() => {
  class FakeTransport {
    onData?: ((message: never) => void) | undefined
    onError?: ((error: unknown) => void) | undefined
    onStatus?: ((message: unknown) => void) | undefined
    readonly close = vi.fn()
    readonly connect = vi.fn().mockResolvedValue(undefined)
    readonly send = vi.fn()

    constructor(readonly options: { url: string; token: string; encoding?: string }) {}
  }

  return {
    instances: [] as FakeTransport[],
    Transport: FakeTransport,
  }
})

vi.mock('@/services/transport', () => ({
  WebSocketTransport: class extends transportMocks.Transport {
    constructor(options: { url: string; token: string; encoding?: string }) {
      super(options)
      transportMocks.instances.push(this)
    }
  },
}))

vi.mock('@/components/connect/QuickConnectDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: { type: Boolean, required: true },
    },
    emits: ['connect', 'update:open'],
    setup(props, { emit }) {
      const store = useSessionStore()

      function connect(): void {
        const tab = store.openTab({ label: 'ops@example.com', state: 'connecting' })
        emit('connect', {
          tabId: tab.id,
          username: 'ops',
          host: 'example.com',
          port: 22,
          password: 'top-secret',
        })
        emit('update:open', false)
      }

      return { connect, props }
    },
    template: `<button v-if="props.open" data-testid="confirm-connect" @click="connect">Connect</button>`,
  }),
}))

const knownHostsMocks = vi.hoisted(() => ({
  forget: vi.fn(),
  lookup: vi.fn().mockResolvedValue(null),
  pin: vi.fn().mockResolvedValue(undefined),
  verify: vi.fn().mockResolvedValue({ status: 'unknown' }),
}))

vi.mock('@/stores/useKnownHostsStore', () => ({
  useKnownHostsStore: () => knownHostsMocks,
}))

const profileMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  isLoading: false,
  profiles: [] as unknown[],
  remove: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/useProfileStore', () => ({
  useProfileStore: () => profileMocks,
}))

vi.mock('@/components/terminal/TerminalPane.vue', () => ({
  default: defineComponent({
    props: {
      transport: { type: Object, default: null },
    },
    template: `<div data-testid="terminal-pane">{{ transport ? 'transport-attached' : 'transport-missing' }}</div>`,
  }),
}))

describe('WorkspaceView', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'))
    setActivePinia(createPinia())
    transportMocks.instances.length = 0
    knownHostsMocks.forget.mockClear()
    knownHostsMocks.lookup.mockClear().mockResolvedValue(null)
    knownHostsMocks.pin.mockClear()
    knownHostsMocks.verify.mockClear()
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  afterEach(() => {
    vi.useRealTimers()
    root.remove()
  })

  it('opens a quick-connect session, wires the transport, and updates latency', async () => {
    const app = createApp(WorkspaceView)
    app.use(createPinia())
    app.mount(root)

    ;(root.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    ;(root.querySelector('[data-testid="confirm-connect"]') as HTMLButtonElement).click()
    // openSession awaits knownHostsStore.lookup() before connecting.
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(transportMocks.instances).toHaveLength(1)
    const transport = transportMocks.instances[0]
    const store = useSessionStore()

    expect(transport.options.url).toMatch(/^ws:\/\/localhost(?::\d+)?\/ws$/)
    expect(transport.options.token).toBe('dev-token')
    expect(transport.connect).toHaveBeenCalledTimes(1)
    expect(transport.send).toHaveBeenCalledTimes(3)
    expect(transport.send.mock.calls.slice(0, 3).map(([message]) => message.type)).toEqual([
      'INIT',
      'AUTH',
      'CONNECT',
    ])
    expect(store.activeTab?.transport).toEqual(transport)

    transport.onStatus?.({
      v: 1,
      type: 'CONNECTED',
      payload: {
        hostKey: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:example' },
        serverId: 'example.com:22',
        sessionId: 'session-1',
      },
    })
    await nextTick()

    expect(store.activeTab?.state).toBe('connected')
    expect(transport.send).toHaveBeenCalledTimes(4)
    expect(transport.send.mock.calls[3]?.[0]?.type).toBe('PING')

    transport.onStatus?.({
      v: 1,
      type: 'PONG',
      payload: {
        timestamp: Date.now() - 37,
        serverTime: Date.now(),
      },
    })
    await nextTick()

    expect(root.textContent).toContain('Connected')
    expect(root.textContent).toContain('37 ms')
    expect(root.textContent).toContain('transport-attached')

    app.unmount()
  })

  it('prompts to trust an unpinned host key after CONNECTED, and pins on accept', async () => {
    const app = createApp(WorkspaceView)
    app.use(createPinia())
    app.mount(root)

    ;(root.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    ;(root.querySelector('[data-testid="confirm-connect"]') as HTMLButtonElement).click()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(knownHostsMocks.lookup).toHaveBeenCalledWith('example.com:22')

    const transport = transportMocks.instances[0]
    transport.onStatus?.({
      v: 1,
      type: 'CONNECTED',
      payload: {
        hostKey: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:example' },
        serverId: 'example.com:22',
        sessionId: 'session-1',
      },
    })
    await nextTick()

    expect(root.textContent).toContain('Trust this fingerprint?')
    expect(root.textContent).toContain('ssh-ed25519')
    expect(root.textContent).toContain('SHA256:example')

    const trustButton = Array.from(root.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Trust & Pin'),
    ) as HTMLButtonElement
    trustButton.click()
    await nextTick()

    expect(knownHostsMocks.pin).toHaveBeenCalledWith(
      'example.com:22',
      'ssh-ed25519',
      'SHA256:example',
    )
    expect(root.textContent).not.toContain('Trust this fingerprint?')

    app.unmount()
  })

  it('closes the transport when a host-key prompt is rejected', async () => {
    const app = createApp(WorkspaceView)
    app.use(createPinia())
    app.mount(root)

    ;(root.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    ;(root.querySelector('[data-testid="confirm-connect"]') as HTMLButtonElement).click()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    const transport = transportMocks.instances[0]
    transport.onStatus?.({
      v: 1,
      type: 'CONNECTED',
      payload: {
        hostKey: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:example' },
        serverId: 'example.com:22',
        sessionId: 'session-1',
      },
    })
    await nextTick()

    const rejectButton = Array.from(root.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reject & Disconnect'),
    ) as HTMLButtonElement
    rejectButton.click()
    await nextTick()

    expect(knownHostsMocks.pin).not.toHaveBeenCalled()
    expect(transport.close).toHaveBeenCalledTimes(1)

    app.unmount()
  })

  it('skips the host-key prompt when the host is already pinned', async () => {
    knownHostsMocks.lookup.mockResolvedValue({
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:example',
    })

    const app = createApp(WorkspaceView)
    app.use(createPinia())
    app.mount(root)

    ;(root.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    ;(root.querySelector('[data-testid="confirm-connect"]') as HTMLButtonElement).click()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    const transport = transportMocks.instances[0]
    expect(transport.send.mock.calls[0]?.[0]?.payload?.hostKey).toEqual({
      mode: 'pinned',
      fingerprint: 'SHA256:example',
      algorithm: 'ssh-ed25519',
    })

    transport.onStatus?.({
      v: 1,
      type: 'CONNECTED',
      payload: {
        hostKey: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:example' },
        serverId: 'example.com:22',
        sessionId: 'session-1',
      },
    })
    await nextTick()

    expect(root.textContent).not.toContain('Trust this fingerprint?')

    app.unmount()
  })

  it('shows the mismatch warning on ERROR{HOST_KEY_MISMATCH} and re-pins with friction', async () => {
    knownHostsMocks.lookup.mockResolvedValue({
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:original',
    })

    const app = createApp(WorkspaceView)
    app.use(createPinia())
    app.mount(root)

    ;(root.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    ;(root.querySelector('[data-testid="confirm-connect"]') as HTMLButtonElement).click()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    const transport = transportMocks.instances[0]
    transport.onError?.({
      v: 1,
      type: 'ERROR',
      payload: {
        code: 'HOST_KEY_MISMATCH',
        message: 'host key mismatch for example.com:22: got SHA256:rotated want SHA256:original',
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(root.textContent).toContain('Host Key Changed')
    expect(root.textContent).toContain('SHA256:original')
    expect(root.textContent).toContain('SHA256:rotated')

    const repinButton = Array.from(root.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Re-pin Anyway'),
    ) as HTMLButtonElement
    expect(repinButton.disabled).toBe(true)

    const confirmInput = root.querySelector('input') as HTMLInputElement
    confirmInput.value = 'example.com:22'
    confirmInput.dispatchEvent(new Event('input'))
    await nextTick()
    expect(repinButton.disabled).toBe(false)

    repinButton.click()
    await nextTick()

    expect(knownHostsMocks.pin).toHaveBeenCalledWith(
      'example.com:22',
      'ssh-ed25519',
      'SHA256:rotated',
    )

    app.unmount()
  })

  it('falls back to first-use (not a dead-end error) when a known-hosts record fails to decrypt', async () => {
    // Simulates the interim-key-lost-on-reload limitation
    // (crypto/interimKnownHostsKey.ts): decrypt throws, indistinguishable
    // from real tampering, but should be treated as "unknown" rather than
    // blocking the connection outright.
    knownHostsMocks.lookup.mockRejectedValue(
      new Error(
        'known-hosts record for example.com:22 failed integrity check (tampered ciphertext or wrong key)',
      ),
    )

    const app = createApp(WorkspaceView)
    app.use(createPinia())
    app.mount(root)

    ;(root.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    ;(root.querySelector('[data-testid="confirm-connect"]') as HTMLButtonElement).click()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(transportMocks.instances).toHaveLength(1)
    const transport = transportMocks.instances[0]
    expect(transport.connect).toHaveBeenCalledTimes(1)
    expect(transport.send.mock.calls[0]?.[0]?.payload?.hostKey).toEqual({ mode: 'first-use' })

    const store = useSessionStore()
    expect(store.activeTab?.state).not.toBe('error')

    app.unmount()
  })
})
