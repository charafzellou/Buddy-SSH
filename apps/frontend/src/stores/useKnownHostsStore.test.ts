// @vitest-environment jsdom

import 'fake-indexeddb/auto'

import { resetInterimKnownHostsKeyForTests } from '@/crypto/interimKnownHostsKey'
import { closeDatabaseForTests, getKnownHost, putKnownHost } from '@/services/storage'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { indexedDB } from 'fake-indexeddb'
import { useKnownHostsStore } from './useKnownHostsStore'

describe('useKnownHostsStore', () => {
	beforeEach(async () => {
		setActivePinia(createPinia())
		await closeDatabaseForTests()
		resetInterimKnownHostsKeyForTests()
		await new Promise<void>((resolve) => {
			const request = indexedDB.deleteDatabase('buddy-ssh')
			request.onsuccess = () => resolve()
			request.onerror = () => resolve()
			request.onblocked = () => resolve()
		})
	})

	it('pins a host, then looks it up and matches', async () => {
		const store = useKnownHostsStore()

		await store.pin('example.com:22', 'ssh-ed25519', 'SHA256:abc123')

		const found = await store.lookup('example.com:22')
		expect(found).toEqual({ algorithm: 'ssh-ed25519', fingerprint: 'SHA256:abc123' })

		const result = await store.verify('example.com:22', 'ssh-ed25519', 'SHA256:abc123')
		expect(result).toEqual({ status: 'match' })
	})

	it('reports unknown for a host that was never pinned', async () => {
		const store = useKnownHostsStore()

		expect(await store.lookup('never-pinned.example.com:22')).toBeNull()
		expect(await store.verify('never-pinned.example.com:22', 'ssh-ed25519', 'SHA256:x')).toEqual({
			status: 'unknown',
		})
	})

	it('reports a mismatch when the presented fingerprint changes', async () => {
		const store = useKnownHostsStore()
		await store.pin('example.com:22', 'ssh-ed25519', 'SHA256:original')

		const result = await store.verify('example.com:22', 'ssh-ed25519', 'SHA256:different')

		expect(result).toEqual({
			status: 'mismatch',
			pinned: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:original' },
		})
	})

	it('re-pinning updates the stored fingerprint but keeps firstSeen', async () => {
		const store = useKnownHostsStore()
		await store.pin('example.com:22', 'ssh-ed25519', 'SHA256:original')
		await store.pin('example.com:22', 'ssh-ed25519', 'SHA256:rotated')

		const found = await store.lookup('example.com:22')
		expect(found?.fingerprint).toBe('SHA256:rotated')
	})

	it('forgets a pinned host', async () => {
		const store = useKnownHostsStore()
		await store.pin('example.com:22', 'ssh-ed25519', 'SHA256:abc123')

		await store.forget('example.com:22')

		expect(await store.lookup('example.com:22')).toBeNull()
	})

	it('fails to decrypt a tampered record instead of silently trusting it', async () => {
		const store = useKnownHostsStore()
		await store.pin('example.com:22', 'ssh-ed25519', 'SHA256:abc123')

		const record = await getKnownHost('example.com:22')
		expect(record).toBeDefined()
		const tampered = new Uint8Array(record!.ciphertext as ArrayBuffer)
		tampered[0] = tampered[0]! ^ 0xff
		await putKnownHost({ ...record!, ciphertext: tampered.buffer })

		await expect(store.lookup('example.com:22')).rejects.toThrow(/integrity check/)
	})
})
