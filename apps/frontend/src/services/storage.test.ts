// @vitest-environment jsdom

import 'fake-indexeddb/auto'

import { indexedDB } from 'fake-indexeddb'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabaseForTests,
  deleteKnownHost,
  deleteProfile,
  getKnownHost,
  getMeta,
  getProfile,
  getSetting,
  listProfiles,
  listProfilesByHost,
  listProfilesByTag,
  type Profile,
  putKnownHost,
  putMeta,
  putProfile,
  putSetting,
} from './storage'

async function freshDatabase(): Promise<void> {
  await closeDatabaseForTests()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('buddy-ssh')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  const now = Date.now()
  return {
    id: 'profile-1',
    nickname: 'Prod box',
    host: 'example.com',
    port: 22,
    username: 'ops',
    authType: 'password',
    tags: ['prod', 'web'],
    terminalPrefs: {},
    connectionPrefs: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('services/storage', () => {
  beforeEach(async () => {
    await freshDatabase()
  })

  it('does CRUD on knownHosts (still works after the schema extension)', async () => {
    await putKnownHost({
      host: 'example.com:22',
      algorithm: 'ssh-ed25519',
      ciphertext: new Uint8Array([1, 2, 3]).buffer,
      meta: {
        version: 1,
        kdf: { algo: 'interim-session', params: {}, salt: '' },
        cipher: { algo: 'AES-256-GCM', nonce: 'abc' },
        keyId: 'k1',
        createdAt: Date.now(),
      },
      firstSeen: Date.now(),
      pinnedAt: Date.now(),
    })

    expect(await getKnownHost('example.com:22')).toBeDefined()
    await deleteKnownHost('example.com:22')
    expect(await getKnownHost('example.com:22')).toBeUndefined()
  })

  it('does CRUD on profiles', async () => {
    const profile = makeProfile()
    await putProfile(profile)

    expect(await getProfile('profile-1')).toEqual(profile)
    expect(await listProfiles()).toEqual([profile])

    await deleteProfile('profile-1')
    expect(await getProfile('profile-1')).toBeUndefined()
    expect(await listProfiles()).toEqual([])
  })

  it('looks up profiles by the by-host index', async () => {
    await putProfile(makeProfile({ id: 'p1', host: 'a.example.com' }))
    await putProfile(makeProfile({ id: 'p2', host: 'b.example.com' }))
    await putProfile(makeProfile({ id: 'p3', host: 'a.example.com' }))

    const found = await listProfilesByHost('a.example.com')
    expect(found.map((p) => p.id).sort()).toEqual(['p1', 'p3'])
  })

  it('looks up profiles by the multi-entry by-tag index', async () => {
    await putProfile(makeProfile({ id: 'p1', tags: ['prod', 'db'] }))
    await putProfile(makeProfile({ id: 'p2', tags: ['staging'] }))
    await putProfile(makeProfile({ id: 'p3', tags: ['prod'] }))

    const found = await listProfilesByTag('prod')
    expect(found.map((p) => p.id).sort()).toEqual(['p1', 'p3'])
  })

  it('does CRUD on settings', async () => {
    await putSetting('theme', 'dark')
    expect(await getSetting('theme')).toBe('dark')

    await putSetting('theme', 'light')
    expect(await getSetting('theme')).toBe('light')

    expect(await getSetting('never-set')).toBeUndefined()
  })

  it('does CRUD on meta', async () => {
    await putMeta('dbVersion', 2)
    expect(await getMeta('dbVersion')).toBe(2)
  })

  it('migrates an existing v1 database (knownHosts only) to v2, preserving data', async () => {
    // Simulate a v1 database that predates the profiles/settings/meta
    // stores, per 07-storage-spec.md §4's additive migration strategy.
    const v1db = await openDB('buddy-ssh', 1, {
      upgrade(db) {
        db.createObjectStore('knownHosts', { keyPath: 'host' })
      },
    })
    await v1db.put('knownHosts', {
      host: 'legacy.example.com:22',
      algorithm: 'ssh-ed25519',
      ciphertext: new Uint8Array([9, 9, 9]).buffer,
      meta: {
        version: 1,
        kdf: { algo: 'interim-session', params: {}, salt: '' },
        cipher: { algo: 'AES-256-GCM', nonce: 'xyz' },
        keyId: 'k1',
        createdAt: Date.now(),
      },
      firstSeen: Date.now(),
      pinnedAt: Date.now(),
    })
    v1db.close()

    // Reopening via storage.ts's getDB() (through any exported function)
    // should upgrade to v2, adding the new stores without touching the
    // pre-existing knownHosts data.
    const preserved = await getKnownHost('legacy.example.com:22')
    expect(preserved?.host).toBe('legacy.example.com:22')

    await putProfile(makeProfile())
    expect(await listProfiles()).toHaveLength(1)
  })
})
