import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { isRef, toRaw } from 'vue'

// deepToRaw strips Vue reactivity recursively before handing data to
// IndexedDB. A single top-level toRaw() isn't enough: values sourced from
// reactive store state (e.g. a Profile object spread from useProfileStore's
// computed .profiles) still have reactive Proxies on their *nested* plain
// objects, and IndexedDB's structured-clone algorithm throws
// DataCloneError on a Proxy — it can't clone something it doesn't
// recognize as a plain object. ArrayBuffer/typed arrays are returned as-is
// (already clonable, and recursing into their indices would be wrong).
function deepToRaw<T>(value: T): T {
	if (isRef(value)) {
		return deepToRaw(value.value) as T
	}

	if (Array.isArray(value)) {
		return value.map((item) => deepToRaw(item)) as T
	}

	// instanceof ArrayBuffer is realm-sensitive (fails across jsdom/Node
	// global boundaries in tests); Object.prototype.toString's internal
	// [[Class]] tag is realm-safe. Getting this wrong silently turns a
	// ciphertext buffer into an empty {} (ArrayBuffer has no own enumerable
	// keys), which crypto.subtle.decrypt then rejects.
	if (Object.prototype.toString.call(value) === '[object ArrayBuffer]' || ArrayBuffer.isView(value)) {
		return value
	}

	if (value !== null && typeof value === 'object') {
		const raw = toRaw(value)
		const result: Record<string, unknown> = {}
		for (const key of Object.keys(raw)) {
			result[key] = deepToRaw((raw as Record<string, unknown>)[key])
		}
		return result as T
	}

	return value
}

export interface CryptoMetadata {
	version: 1
	kdf: {
		algo: 'argon2id' | 'pbkdf2' | 'interim-session'
		params: Record<string, unknown>
		salt: string
	}
	cipher: {
		algo: 'AES-256-GCM'
		nonce: string
		aad?: string
	}
	keyId: string
	createdAt: number
	rotatedAt?: number
}

export interface KnownHostRecord {
	host: string
	algorithm: string
	ciphertext: ArrayBuffer
	meta: CryptoMetadata
	firstSeen: number
	pinnedAt: number
}

export interface Profile {
	id: string
	nickname: string
	host: string
	port: number
	username: string
	authType: 'password' | 'publickey' | 'keyboard-interactive'
	/** Reference to an encryptedKeys.keyId, if a key is associated (M6). */
	keyId?: string
	tags: string[]
	folder?: string
	notes?: string
	color?: string
	terminalPrefs: {
		term?: string
		fontSize?: number
		fontFamily?: string
		scrollback?: number
		theme?: string
	}
	connectionPrefs: {
		keepalive?: number
		reconnect?: boolean
		idleTimeout?: number
	}
	/** Jump-host chain (future; stored but not used in MVP). */
	jumpHosts?: string[]
	createdAt: number
	updatedAt: number
}

interface BuddySshDB extends DBSchema {
	knownHosts: {
		key: string
		value: KnownHostRecord
	}
	profiles: {
		key: string
		value: Profile
		indexes: { 'by-host': string; 'by-tag': string }
	}
	settings: {
		key: string
		value: { key: string; value: unknown }
	}
	meta: {
		key: string
		value: { key: string; value: unknown }
	}
}

const databaseName = 'buddy-ssh'
const databaseVersion = 2

let dbPromise: Promise<IDBPDatabase<BuddySshDB>> | null = null

// getDB lazily opens (and caches) the shared buddy-ssh IndexedDB database.
// Each store is created idempotently (existence-checked) rather than
// gated on the version-bump number, so the upgrade handler works correctly
// both for a fresh database opened directly at the latest version and for
// an existing one stepping forward — per the additive migration strategy
// in 07-storage-spec.md §4.
function getDB(): Promise<IDBPDatabase<BuddySshDB>> {
	if (!dbPromise) {
		dbPromise = openDB<BuddySshDB>(databaseName, databaseVersion, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('knownHosts')) {
					db.createObjectStore('knownHosts', { keyPath: 'host' })
				}

				if (!db.objectStoreNames.contains('profiles')) {
					const profiles = db.createObjectStore('profiles', { keyPath: 'id' })
					profiles.createIndex('by-host', 'host')
					profiles.createIndex('by-tag', 'tags', { multiEntry: true })
				}

				if (!db.objectStoreNames.contains('settings')) {
					db.createObjectStore('settings', { keyPath: 'key' })
				}

				if (!db.objectStoreNames.contains('meta')) {
					db.createObjectStore('meta', { keyPath: 'key' })
				}
			},
		})
	}

	return dbPromise
}

export async function getKnownHost(host: string): Promise<KnownHostRecord | undefined> {
	const db = await getDB()
	return db.get('knownHosts', host)
}

export async function putKnownHost(record: KnownHostRecord): Promise<void> {
	const db = await getDB()
	await db.put('knownHosts', deepToRaw(record))
}

export async function deleteKnownHost(host: string): Promise<void> {
	const db = await getDB()
	await db.delete('knownHosts', host)
}

export async function getProfile(id: string): Promise<Profile | undefined> {
	const db = await getDB()
	return db.get('profiles', id)
}

export async function listProfiles(): Promise<Profile[]> {
	const db = await getDB()
	return db.getAll('profiles')
}

export async function listProfilesByHost(host: string): Promise<Profile[]> {
	const db = await getDB()
	return db.getAllFromIndex('profiles', 'by-host', host)
}

export async function listProfilesByTag(tag: string): Promise<Profile[]> {
	const db = await getDB()
	return db.getAllFromIndex('profiles', 'by-tag', tag)
}

export async function putProfile(profile: Profile): Promise<void> {
	const db = await getDB()
	await db.put('profiles', deepToRaw(profile))
}

export async function deleteProfile(id: string): Promise<void> {
	const db = await getDB()
	await db.delete('profiles', id)
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
	const db = await getDB()
	const record = await db.get('settings', key)
	return record?.value as T | undefined
}

export async function putSetting(key: string, value: unknown): Promise<void> {
	const db = await getDB()
	await db.put('settings', { key, value: deepToRaw(value) })
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
	const db = await getDB()
	const record = await db.get('meta', key)
	return record?.value as T | undefined
}

export async function putMeta(key: string, value: unknown): Promise<void> {
	const db = await getDB()
	await db.put('meta', { key, value: deepToRaw(value) })
}

// closeDatabaseForTests closes and drops the cached connection so tests can
// safely delete and reopen a fresh fake-indexeddb instance between cases
// (deleteDatabase blocks/hangs while a connection is still open).
export async function closeDatabaseForTests(): Promise<void> {
	if (dbPromise) {
		const db = await dbPromise
		db.close()
	}

	dbPromise = null
}
