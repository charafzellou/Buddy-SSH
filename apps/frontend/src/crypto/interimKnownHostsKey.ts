// TEMPORARY (M4, pre-M6): the known-hosts store needs an AES-256-GCM key to
// encrypt fingerprints at rest, but the real key — an HKDF subkey derived
// from the user's master password via useAuthStore — doesn't exist until
// M6 lands (crypto/keys.ts deriveSubkey). Interim: a random, non-extractable
// key generated once per page session and held only in memory.
//
// This means known-hosts pinning does NOT yet provide real protection
// across page reloads: the key is lost on reload, so previously-encrypted
// records become undecryptable (surfacing as a "tampered" failure even
// though nothing was actually tampered with). This is a known, documented
// MVP limitation, not a bug — TOFU mismatch detection still works correctly
// within a single page session.
//
// TODO(M6): replace getInterimKnownHostsKey() with
// deriveSubkey(useAuthStore().derivedKey, 'known-hosts') once useAuthStore
// and crypto/keys.ts exist, and migrate any interim-encrypted records.

let cachedKey: Promise<CryptoKey> | null = null

export function getInterimKnownHostsKey(): Promise<CryptoKey> {
	if (!cachedKey) {
		cachedKey = crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
	}

	return cachedKey
}

// resetInterimKnownHostsKeyForTests forces a fresh key on the next call,
// simulating "key lost across reload" for tests.
export function resetInterimKnownHostsKeyForTests(): void {
	cachedKey = null
}
