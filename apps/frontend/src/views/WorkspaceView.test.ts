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
})