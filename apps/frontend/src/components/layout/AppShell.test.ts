// @vitest-environment jsdom

import { createApp, defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import AppShell from './AppShell.vue'

describe('AppShell', () => {
	it('renders its layout slots', () => {
		const root = document.createElement('div')
		document.body.appendChild(root)

		const app = createApp(
			defineComponent({
				components: { AppShell },
				template: `
					<AppShell title="Workspace Demo">
						<template #header><span>Header Action</span></template>
						<template #sidebar><span>Sidebar Region</span></template>
						<template #tabbar><span>Tab Region</span></template>
						<template #status><span>Status Region</span></template>
						<div>Pane Region</div>
					</AppShell>
				`,
			}),
		)

		app.mount(root)

		expect(root.textContent).toContain('Workspace Demo')
		expect(root.textContent).toContain('Header Action')
		expect(root.textContent).toContain('Sidebar Region')
		expect(root.textContent).toContain('Tab Region')
		expect(root.textContent).toContain('Pane Region')
		expect(root.textContent).toContain('Status Region')

		app.unmount()
		root.remove()
	})
})