// @vitest-environment jsdom

import 'fake-indexeddb/auto'

import { closeDatabaseForTests, type Profile } from '@/services/storage'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { indexedDB } from 'fake-indexeddb'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { useProfileStore } from './useProfileStore'

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

// useProfileStore relies on @tanstack/vue-query's useQuery/useMutation,
// which inject a QueryClient from the active Vue app context. Plain
// `setActivePinia(createPinia())` (the pattern every other store test uses)
// has no app context, so the store is instantiated inside a minimal app via
// runWithContext instead, with a fresh QueryClient per test.
function instantiateStore(): ReturnType<typeof useProfileStore> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const app = createApp({})
	app.use(pinia)
	app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) })

	return app.runWithContext(() => useProfileStore())
}

describe('useProfileStore', () => {
	beforeEach(async () => {
		await closeDatabaseForTests()
		await new Promise<void>((resolve) => {
			const request = indexedDB.deleteDatabase('buddy-ssh')
			request.onsuccess = () => resolve()
			request.onerror = () => resolve()
			request.onblocked = () => resolve()
		})
	})

	it('starts empty, and lists a saved profile after invalidation refetches', async () => {
		const store = instantiateStore()
		await nextTick()
		expect(store.profiles).toEqual([])

		await store.save(makeProfile())
		await vi.waitUntil(() => store.profiles.length > 0, { timeout: 2000 })

		expect(store.profiles.map((p) => p.id)).toEqual(['profile-1'])
	})

	it('excludes a profile from the list after delete', async () => {
		const store = instantiateStore()
		await store.save(makeProfile({ id: 'profile-1' }))
		await store.save(makeProfile({ id: 'profile-2' }))
		await vi.waitUntil(() => store.profiles.length === 2, { timeout: 2000 })

		expect(store.profiles.map((p) => p.id).sort()).toEqual(['profile-1', 'profile-2'])

		await store.remove('profile-1')
		await vi.waitUntil(() => store.profiles.length === 1, { timeout: 2000 })

		expect(store.profiles.map((p) => p.id)).toEqual(['profile-2'])
	})

	it('findById returns the matching profile or undefined', async () => {
		const store = instantiateStore()
		await store.save(makeProfile({ id: 'profile-1', nickname: 'Alpha' }))
		await vi.waitUntil(() => store.profiles.length > 0, { timeout: 2000 })

		expect(store.findById('profile-1')?.nickname).toBe('Alpha')
		expect(store.findById('missing')).toBeUndefined()
	})
})
