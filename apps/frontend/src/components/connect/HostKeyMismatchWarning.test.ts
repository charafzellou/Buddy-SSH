// @vitest-environment jsdom

import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HostKeyMismatchWarning from './HostKeyMismatchWarning.vue'

describe('HostKeyMismatchWarning', () => {
	let root: HTMLDivElement

	beforeEach(() => {
		root = document.createElement('div')
		document.body.appendChild(root)
	})

	afterEach(() => {
		root.remove()
	})

	it('shows both the old and new fingerprints', () => {
		const app = createApp(HostKeyMismatchWarning, {
			open: true,
			host: 'example.com:22',
			algorithm: 'ssh-ed25519',
			oldFingerprint: 'SHA256:old-value',
			newFingerprint: 'SHA256:new-value',
		})
		app.mount(root)

		expect(root.textContent).toContain('SHA256:old-value')
		expect(root.textContent).toContain('SHA256:new-value')

		app.unmount()
	})

	it('disables re-pin until the hostname is typed exactly, then emits repin', async () => {
		const onRepin = vi.fn()
		const app = createApp(HostKeyMismatchWarning, {
			open: true,
			host: 'example.com:22',
			algorithm: 'ssh-ed25519',
			oldFingerprint: 'SHA256:old-value',
			newFingerprint: 'SHA256:new-value',
			onRepin,
		})
		app.mount(root)
		await nextTick()

		const repinButton = root.querySelectorAll('button')[1] as HTMLButtonElement
		expect(repinButton.disabled).toBe(true)

		repinButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		expect(onRepin).not.toHaveBeenCalled()

		const input = root.querySelector('input') as HTMLInputElement
		input.value = 'wrong-host'
		input.dispatchEvent(new Event('input'))
		await nextTick()
		expect(repinButton.disabled).toBe(true)

		input.value = 'example.com:22'
		input.dispatchEvent(new Event('input'))
		await nextTick()
		expect(repinButton.disabled).toBe(false)

		repinButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		expect(onRepin).toHaveBeenCalledTimes(1)

		app.unmount()
	})

	it('emits abort without requiring confirmation text', () => {
		const onAbort = vi.fn()
		const app = createApp(HostKeyMismatchWarning, {
			open: true,
			host: 'example.com:22',
			algorithm: 'ssh-ed25519',
			oldFingerprint: 'SHA256:old-value',
			newFingerprint: 'SHA256:new-value',
			onAbort,
		})
		app.mount(root)

		const abortButton = root.querySelectorAll('button')[0] as HTMLButtonElement
		abortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		expect(onAbort).toHaveBeenCalledTimes(1)
		app.unmount()
	})
})
