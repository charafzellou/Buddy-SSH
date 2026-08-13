// deriveSubkey derives a distinct AES-256-GCM CryptoKey from the master
// HKDF key for a given info label, isolating compromise across stores
// (08-crypto-spec.md §5): "buddy-ssh/keys" for encryptedKeys,
// "buddy-ssh/knownHosts" for knownHosts. The empty salt is intentional —
// the master key is already salted via the KDF (Argon2id/PBKDF2) that
// produced it; HKDF's salt is optional and defaults to a zero-filled
// buffer per RFC 5869 when omitted.
export async function deriveSubkey(master: CryptoKey, info: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    master,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
