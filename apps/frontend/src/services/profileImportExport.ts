import type { Profile } from '@/services/storage'

export interface ProfileExportFile {
  version: 1
  exportedAt: number
  profiles: Profile[]
}

// Explicit allow-list rather than JSON.stringify(profile) directly: if a
// secret-bearing field (e.g. a cached password) is ever added to Profile in
// the future, it must be deliberately added here too, instead of leaking
// into an export by default. keyId is a reference to encrypted key material
// stored elsewhere (M6) — not a secret itself.
function sanitizeForExport(profile: Profile): Profile {
  return {
    id: profile.id,
    nickname: profile.nickname,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authType: profile.authType,
    keyId: profile.keyId,
    tags: [...profile.tags],
    folder: profile.folder,
    notes: profile.notes,
    color: profile.color,
    terminalPrefs: { ...profile.terminalPrefs },
    connectionPrefs: { ...profile.connectionPrefs },
    jumpHosts: profile.jumpHosts ? [...profile.jumpHosts] : undefined,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

export function exportProfiles(profiles: Profile[]): string {
  const file: ProfileExportFile = {
    version: 1,
    exportedAt: Date.now(),
    profiles: profiles.map(sanitizeForExport),
  }
  return JSON.stringify(file, null, 2)
}

export class ProfileImportError extends Error {}

// importProfiles parses and validates an exported JSON file, returning
// ready-to-save Profile objects. Each imported profile gets a fresh id
// (never reuses the exported id) so importing never silently overwrites an
// existing profile, and fresh createdAt/updatedAt timestamps.
export function importProfiles(json: string): Profile[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new ProfileImportError('File is not valid JSON', { cause: error })
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('profiles' in parsed) ||
    !Array.isArray((parsed as { profiles: unknown }).profiles)
  ) {
    throw new ProfileImportError('File does not look like a Buddy-SSH profile export')
  }

  const now = Date.now()
  return (parsed as ProfileExportFile).profiles.map((raw) => {
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof raw.nickname !== 'string' ||
      typeof raw.host !== 'string' ||
      typeof raw.port !== 'number' ||
      typeof raw.username !== 'string'
    ) {
      throw new ProfileImportError('One or more profiles are missing required fields')
    }

    const sanitized = sanitizeForExport(raw as Profile)
    return {
      ...sanitized,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
  })
}
