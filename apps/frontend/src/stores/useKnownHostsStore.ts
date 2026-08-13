import { getInterimKnownHostsKey } from '@/crypto/interimKnownHostsKey'
import {
	type CryptoMetadata,
	deleteKnownHost,
	getKnownHost,
	type KnownHostRecord,
	putKnownHost,
} from '@/services/storage'
import { defineStore } from 'pinia'

export interface KnownHostFingerprint {
	algorithm: string
	fingerprint: string
}

export type VerifyResult =
	| { status: 'match' }
	| { status: 'mismatch'; pinned: KnownHostFingerprint }
	| { status: 'unknown' }

export const useKnownHostsStore = defineStore('knownHosts', () => {
	async function pin(host: string, algorithm: string, fingerprint: string): Promise<void> {
		const key = await getInterimKnownHostsKey()
		const nonce = crypto.getRandomValues(new Uint8Array(12))
		const ciphertext = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv: nonce },
			key,
			new TextEncoder().encode(fingerprint),
		)

		const existing = await getKnownHost(host)
		const now = Date.now()
		const meta: CryptoMetadata = {
			version: 1,
			kdf: { algo: 'interim-session', params: {}, salt: '' },
			cipher: { algo: 'AES-256-GCM', nonce: bytesToBase64(nonce) },
			keyId: 'interim-session-key',
			createdAt: now,
		}

		const record: KnownHostRecord = {
			host,
			algorithm,
			ciphertext,
			meta,
			firstSeen: existing?.firstSeen ?? now,
			pinnedAt: now,
		}

		await putKnownHost(record)
	}

	// verify compares a freshly presented host key against the pinned
	// record (TOFU mismatch detection). Never silently trusts a changed key.
	async function verify(host: string, algorithm: string, fingerprint: string): Promise<VerifyResult> {
		const pinned = await lookup(host)
		if (!pinned) {
			return { status: 'unknown' }
		}

		if (pinned.algorithm === algorithm && pinned.fingerprint === fingerprint) {
			return { status: 'match' }
		}

		return { status: 'mismatch', pinned }
	}

	async function lookup(host: string): Promise<KnownHostFingerprint | null> {
		const record = await getKnownHost(host)
		if (!record) {
			return null
		}

		return decryptFingerprint(record)
	}

	async function forget(host: string): Promise<void> {
		await deleteKnownHost(host)
	}

	async function decryptFingerprint(record: KnownHostRecord): Promise<KnownHostFingerprint> {
		const key = await getInterimKnownHostsKey()
		const nonce = base64ToBytes(record.meta.cipher.nonce)

		let plaintext: ArrayBuffer
		try {
			plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, record.ciphertext)
		} catch (error) {
			throw new Error(
				`known-hosts record for ${record.host} failed integrity check (tampered ciphertext or wrong key)`,
				{ cause: error },
			)
		}

		return {
			algorithm: record.algorithm,
			fingerprint: new TextDecoder().decode(plaintext),
		}
	}

	return { forget, lookup, pin, verify }
})

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(base64)
	const bytes = new Uint8Array(new ArrayBuffer(binary.length))
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index)
	}
	return bytes
}
