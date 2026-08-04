// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import TerminalPane from './TerminalPane.vue'

const terminalMocks = vi.hoisted(() => ({
	dispose: vi.fn(),
	resizeDispose: vi.fn(),
	useResize: vi.fn(),
	useTerminal: vi.fn(),
}))

vi.mock('@/composables/useTerminal', () => ({
	useTerminal: terminalMocks.useTerminal,
}))

vi.mock('@/composables/useResize', () => ({
	useResize: terminalMocks.useResize,
}))

describe('TerminalPane', () => {
	let root: HTMLDivElement

	beforeEach(() => {
		setActivePinia(createPinia())
		root = document.createElement('div')
		document.body.appendChild(root)
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn().mockReturnValue({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			}),
		})
		terminalMocks.dispose.mockReset()
		terminalMocks.resizeDispose.mockReset()
		terminalMocks.useResize.mockReset().mockReturnValue({
			dispose: terminalMocks.resizeDispose,
		})
		terminalMocks.useTerminal.mockReset().mockReturnValue({
			bundle: {} as never,
			dispose: terminalMocks.dispose,
		})
	})

	afterEach(() => {
		root.remove()
	})

	it('renders the empty state when no transport is attached', () => {
		const app = createApp(TerminalPane, { transport: null })
		app.use(createPinia())
		app.mount(root)

		expect(root.textContent).toContain('No active session yet')
		expect(terminalMocks.useTerminal).not.toHaveBeenCalled()

		app.unmount()
	})

	it('creates and disposes a terminal when a transport is provided', async () => {
		const transport = { send: vi.fn() }
		const app = createApp(TerminalPane, { transport })
		app.use(createPinia())
		app.mount(root)
		await nextTick()

		expect(terminalMocks.useTerminal).toHaveBeenCalledTimes(1)
		expect(terminalMocks.useResize).toHaveBeenCalledTimes(1)

		app.unmount()
		expect(terminalMocks.dispose).toHaveBeenCalledTimes(1)
		expect(terminalMocks.resizeDispose).toHaveBeenCalledTimes(1)
	})
})