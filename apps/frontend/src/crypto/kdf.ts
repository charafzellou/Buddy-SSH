import { argon2id } from 'hash-wasm'

export interface Argon2idParams {
	memorySize: number
	iterations: number
	parallelism: number
	hashLength: number
}

export interface Pbkdf2Params {
	iterations: number
	hash: 'SHA-256'
	hashLength: number
}

export type KdfMeta =
	| { algo: 'argon2id'; params: Argon2idParams; salt: string }
	| { algo: 'pbkdf2'; params: Pbkdf2Params; salt: string }

// OWASP-aligned defaults per 08-crypto-spec.md §3, tuned for a ~0.5-1s
// interactive unlock on a mid-range laptop.
export const defaultArgon2idParams: Argon2idParams = {
	memorySize: 65_536,
	iterations: 3,
	parallelism: 4,
	hashLength: 32,
}

export const defaultPbkdf2Params: Pbkdf2Params = {
	iterations: 600_000,
	hash: 'SHA-256',
	hashLength: 32,
}

export function generateSalt(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(16))
}

// createKdfMeta probes hash-wasm availability (WASM can be blocked by CSP
// or browser policy) and returns a fresh KdfMeta for a new master password:
// argon2id when available, PBKDF2 fallback otherwise. This is the only
// place fallback selection happens — deriveMasterKey below always executes
// exactly the algorithm named in the meta it's given, so an existing
// record's chosen algorithm never silently changes on read.
export async function createKdfMeta(): Promise<KdfMeta> {
	const salt = generateSalt()

	try {
		await argon2id({
			password: 'probe',
			salt: new Uint8Array(16),
			memorySize: 8,
			iterations: 1,
			parallelism: 1,
			hashLength: 32,
			outputType: 'binary',
		})
		return { algo: 'argon2id', params: defaultArgon2idParams, salt: bytesToBase64(salt) }
	} catch {
		return { algo: 'pbkdf2', params: defaultPbkdf2Params, salt: bytesToBase64(salt) }
	}
}

// deriveMasterKey derives a non-extractable HKDF base key from the master
// password per kdfMeta.algo. It is the root of the key hierarchy — callers
// derive AES-GCM subkeys from it via crypto/keys.ts, never using it to
// encrypt data directly.
export async function deriveMasterKey(masterPassword: string, kdfMeta: KdfMeta): Promise<CryptoKey> {
	const salt = base64ToBytes(kdfMeta.salt)
	const raw =
		kdfMeta.algo === 'argon2id'
			? await deriveArgon2idBytes(masterPassword, salt, kdfMeta.params)
			: await derivePbkdf2Bytes(masterPassword, salt, kdfMeta.params)

	try {
		return await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey', 'deriveBits'])
	} finally {
		raw.fill(0)
	}
}

async function deriveArgon2idBytes(password: string, salt: Uint8Array, params: Argon2idParams): Promise<Uint8Array> {
	return argon2id({
		password,
		salt,
		memorySize: params.memorySize,
		iterations: params.iterations,
		parallelism: params.parallelism,
		hashLength: params.hashLength,
		outputType: 'binary',
	})
}

async function derivePbkdf2Bytes(password: string, salt: Uint8Array, params: Pbkdf2Params): Promise<Uint8Array> {
	const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
		'deriveBits',
	])
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations: params.iterations, hash: params.hash },
		baseKey,
		params.hashLength * 8,
	)
	return new Uint8Array(bits)
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index)
	}
	return bytes
}
