// @vitest-environment jsdom

import 'fake-indexeddb/auto'

import { closeDatabaseForTests, type Profile, putProfile } from '@/services/storage'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { indexedDB } from 'fake-indexeddb'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ProfileList from './ProfileList.vue'

function makeProfile(overrides: Partial<Profile> = {}): Profile {
	const now = Date.now()
	return {
		id: 'profile-1',
		nickname: 'Prod box',
		host: 'example.com',
		port: 22,
		username: 'ops',
		authType: 'password',
		tags: [],
		terminalPrefs: {},
		connectionPrefs: {},
		createdAt: now,
		updatedAt: now,
		...overrides,
	}
}

function mountWithProviders(root: HTMLDivElement, props: Record<string, unknown> = {}) {
	const app = createApp(ProfileList, props)
	app.use(createPinia())
	app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) })
	app.mount(root)
	return app
}

describe('ProfileList', () => {
	let root: HTMLDivElement

	beforeEach(async () => {
		root = document.createElement('div')
		document.body.appendChild(root)
		await closeDatabaseForTests()
		await new Promise<void>((resolve) => {
			const request = indexedDB.deleteDatabase('buddy-ssh')
			request.onsuccess = () => resolve()
			request.onerror = () => resolve()
			request.onblocked = () => resolve()
		})
	})

	afterEach(() => {
		root.remove()
	})

	it('shows the empty state when there are no profiles', async () => {
		const app = mountWithProviders(root)
		await nextTick()
		await nextTick()

		expect(root.textContent).toContain('No saved profiles yet.')

		app.unmount()
	})

	it('renders a card per saved profile', async () => {
		await putProfile(makeProfile({ id: 'p1', nickname: 'Alpha' }))
		await putProfile(makeProfile({ id: 'p2', nickname: 'Beta' }))

		const app = mountWithProviders(root)
		await vi.waitUntil(() => root.textContent?.includes('Alpha'), { timeout: 2000 })
		await nextTick()

		expect(root.textContent).toContain('Alpha')
		expect(root.textContent).toContain('Beta')

		app.unmount()
	})

	it('emits connect with the clicked profile', async () => {
		await putProfile(makeProfile({ id: 'p1', nickname: 'Alpha' }))
		const onConnect = vi.fn()

		const app = mountWithProviders(root, { onConnect })
		await vi.waitUntil(() => root.querySelector('[role="button"]') !== null, { timeout: 2000 })
		await nextTick()

		root.querySelector('[role="button"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		expect(onConnect).toHaveBeenCalledTimes(1)
		expect((onConnect.mock.calls[0]?.[0] as Profile).id).toBe('p1')

		app.unmount()
	})
})
