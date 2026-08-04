// @vitest-environment jsdom

import { createApp } from 'vue'
import { describe, expect, it } from 'vitest'
import StatusBar from './StatusBar.vue'

describe('StatusBar', () => {
	it('renders connection state and latency', () => {
		const root = document.createElement('div')
		document.body.appendChild(root)

		const app = createApp(StatusBar, { state: 'connected', latency: 32 })
		app.mount(root)

		expect(root.textContent).toContain('Connected')
		expect(root.textContent).toContain('32 ms')

		app.unmount()
		root.remove()
	})
})