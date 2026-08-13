// @vitest-environment jsdom

import { createApp } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabItem from './TabItem.vue'

describe('TabItem', () => {
	let root: HTMLDivElement

	beforeEach(() => {
		root = document.createElement('div')
		document.body.appendChild(root)
	})

	afterEach(() => {
		root.remove()
	})

	it('renders the label, active state, and color swatch', () => {
		const app = createApp(TabItem, {
			id: 'tab-1',
			label: 'ops@example.com',
			state: 'connected',
			active: true,
			pinned: false,
			color: '#38bdf8',
		})
		app.mount(root)

		expect(root.textContent).toContain('ops@example.com')
		const tab = root.querySelector('[role="tab"]')
		expect(tab?.getAttribute('aria-selected')).toBe('true')
		expect(tab?.getAttribute('data-state')).toBe('connected')
		expect(root.querySelector('[style*="background-color"]')).not.toBeNull()

		app.unmount()
	})

	it('dims a disconnected, inactive tab', () => {
		const app = createApp(TabItem, {
			id: 'tab-1',
			label: 'ops@example.com',
			state: 'disconnected',
			active: false,
			pinned: false,
		})
		app.mount(root)

		expect(root.querySelector('[role="tab"]')?.className).toContain('opacity-60')

		app.unmount()
	})

	it('emits select when clicked', () => {
		const onSelect = vi.fn()
		const app = createApp(TabItem, {
			id: 'tab-1',
			label: 'ops@example.com',
			state: 'connected',
			active: false,
			pinned: false,
			onSelect,
		})
		app.mount(root)

		root.querySelector('[role="tab"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		expect(onSelect).toHaveBeenCalledWith('tab-1')
		app.unmount()
	})

	it('emits pin and close without triggering select', () => {
		const onSelect = vi.fn()
		const onPin = vi.fn()
		const onClose = vi.fn()
		const app = createApp(TabItem, {
			id: 'tab-1',
			label: 'ops@example.com',
			state: 'connected',
			active: false,
			pinned: false,
			onSelect,
			onPin,
			onClose,
		})
		app.mount(root)

		const buttons = root.querySelectorAll('button')
		buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		expect(onPin).toHaveBeenCalledWith('tab-1')
		expect(onClose).toHaveBeenCalledWith('tab-1')
		expect(onSelect).not.toHaveBeenCalled()

		app.unmount()
	})

	it('shows the pinned button as active when pinned', () => {
		const app = createApp(TabItem, {
			id: 'tab-1',
			label: 'ops@example.com',
			state: 'connected',
			active: false,
			pinned: true,
		})
		app.mount(root)

		const pinButton = root.querySelectorAll('button')[0]
		expect(pinButton?.getAttribute('aria-pressed')).toBe('true')

		app.unmount()
	})
})
