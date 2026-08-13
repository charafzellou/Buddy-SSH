import { describe, expect, it } from 'vitest'
import type { Profile } from '@/services/storage'
import { exportProfiles, importProfiles, ProfileImportError } from './profileImportExport'

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
    folder: 'Work',
    notes: 'primary box',
    color: '#38bdf8',
    terminalPrefs: { fontSize: 14 },
    connectionPrefs: { keepalive: 30 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('profileImportExport', () => {
  it('round-trips profiles through export → import', () => {
    const profiles = [
      makeProfile({ id: 'p1', nickname: 'Alpha' }),
      makeProfile({ id: 'p2', nickname: 'Beta' }),
    ]

    const json = exportProfiles(profiles)
    const imported = importProfiles(json)

    expect(imported).toHaveLength(2)
    expect(imported.map((p) => p.nickname).sort()).toEqual(['Alpha', 'Beta'])
    expect(imported[0]?.host).toBe('example.com')
    expect(imported[0]?.tags).toEqual(['prod', 'web'])
  })

  it('assigns fresh ids and timestamps on import instead of reusing exported ones', () => {
    const original = makeProfile({ id: 'original-id', createdAt: 1000, updatedAt: 1000 })
    const json = exportProfiles([original])

    const [imported] = importProfiles(json)

    expect(imported?.id).not.toBe('original-id')
    expect(imported?.createdAt).not.toBe(1000)
    expect(imported?.updatedAt).not.toBe(1000)
  })

  it('exported JSON never contains password, passphrase, or key material keys', () => {
    // authType legitimately has the *value* "password" as an auth method
    // name, so this asserts on object *keys* (via JSON.parse's reviver),
    // not a substring match on the raw text.
    const profile = makeProfile({
      ...({
        password: 'hunter2',
        passphrase: 'secret',
        privateKey: 'not-a-real-key',
      } as Partial<Profile>),
    })

    const json = exportProfiles([profile])
    const forbiddenKeyPattern = /password|passphrase|privatekey/i
    const foundKeys: string[] = []
    JSON.parse(json, (key, value) => {
      if (forbiddenKeyPattern.test(key)) {
        foundKeys.push(key)
      }
      return value
    })

    expect(foundKeys).toEqual([])
  })

  it('rejects invalid JSON', () => {
    expect(() => importProfiles('not json')).toThrow(ProfileImportError)
  })

  it('rejects a file that is not a profile export', () => {
    expect(() => importProfiles(JSON.stringify({ foo: 'bar' }))).toThrow(ProfileImportError)
  })

  it('rejects a profile missing required fields', () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      profiles: [{ nickname: 'Incomplete' }],
    })
    expect(() => importProfiles(json)).toThrow(ProfileImportError)
  })
})
