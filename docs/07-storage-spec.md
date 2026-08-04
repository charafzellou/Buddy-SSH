# Phase 7 — Browser Storage Specification

**Document status:** Proposed
**Last updated:** 2026-07-26
**Scope:** Client-side persistence in the browser.

This document compares `sessionStorage`, `localStorage`, and `IndexedDB`,
justifies the choice of **IndexedDB**, and specifies the database schema,
migration strategy, and secret-storage policy. It implements FR-60..64 and
the storage-related mitigations in [`02-threat-model.md`](./02-threat-model.md)
§2.4.

---

## 1. Comparison

| Criterion | `sessionStorage` | `localStorage` | `IndexedDB` |
|-----------|------------------|----------------|-------------|
| **Capacity** | ~5 MB per tab | ~5 MB per origin | Hundreds of MB to GB per origin |
| **Persistence** | Tab lifetime only | Until cleared | Until cleared (can request "persistent") |
| **Data model** | String key/value | String key/value | Object stores, indexes, transactions |
| **API** | Synchronous | Synchronous | Asynchronous, transactional |
| **Structured data** | Manual JSON | Manual JSON | Native objects, indexes, key paths |
| **Binary support** | No (string only) | No (string only) | Yes (`ArrayBuffer`, `Blob`) |
| **Encryption suitability** | Poor (string blobs) | Poor (string blobs) | Excellent (binary blobs + metadata) |
| **Performance** | Fast (small data) | Fast (small data) | Scales to large data; async, non-blocking |
| **Browser compatibility** | Universal | Universal | Universal in modern browsers |
| **Worker access** | No | No | Yes (from Web Workers) |
| **Cross-tab sharing** | No (per-tab) | Yes (same origin) | Yes (same origin) |
| **Security notes** | Cleared on tab close (good for ephemeral) | Persists; XSS-readable | Persists; XSS-readable; same-origin |

### 1.1 Analysis

- `sessionStorage` is per-tab and cleared on close — useful only for truly
  ephemeral UI state, not for profiles or keys.
- `localStorage` is synchronous, string-only, and blocks the main thread on
  every access; it is unsuitable for encrypted binary blobs and large
  scrollback snapshots.
- `IndexedDB` is asynchronous, transactional, supports binary data and
  indexes, scales to large data, and is accessible from Web Workers (enabling
  off-main-thread crypto, [`04-frontend-design.md`](./04-frontend-design.md)
  §1 `workers/`).

### 1.2 Decision

**Use IndexedDB** for all persistent client-side data: connection profiles,
settings, encrypted private keys, and the encrypted known-hosts database.
Use `sessionStorage` only for ephemeral per-tab UI state if ever needed (none
currently). Never use `localStorage` for any data (FR-64).

This matches the expected recommendation in `PROMPT.md` and is justified by
IndexedDB's superior support for structured, encrypted, binary data and
asynchronous, worker-friendly access.

---

## 2. Database schema

Database name: `buddy-ssh`. Versioned via an integer version number. All
upgrades are performed in an `onupgradeneeded` transaction.

### 2.1 Object stores

| Store | Key path | Indexes | Holds secrets? |
|-------|----------|---------|----------------|
| `profiles` | `id` | `by-host` (host), `by-tag` (tags, multiEntry) | No |
| `settings` | `key` | — | No |
| `encryptedKeys` | `keyId` | `by-profileId` (profileId) | Yes (encrypted) |
| `knownHosts` | `host` (host:port) | `by-fingerprint` | Yes (encrypted) |
| `meta` | `key` | — | KDF params, version |

### 2.2 `profiles` (no secrets)

```ts
interface Profile {
  id: string                 // uuid
  nickname: string
  host: string
  port: number               // default 22
  username: string
  authType: 'password' | 'publickey' | 'keyboard-interactive'
  /** Reference to an encryptedKey.keyId, if a key is associated. */
  keyId?: string
  tags: string[]
  folder?: string
  notes?: string
  color?: string
  terminalPrefs: {
    term?: string            // default 'xterm-256color'
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
  jumpHosts?: string[]       // profile ids
  createdAt: number
  updatedAt: number
}
```

### 2.3 `settings`

Key/value store of UI settings: `theme`, `fontFamily`, `fontSize`,
`scrollback`, `idleTimeout`, `shortcuts`, `reducedMotion`. Values are JSON.

### 2.4 `encryptedKeys` 🔒

```ts
interface EncryptedKeyRecord {
  keyId: string              // uuid
  profileId?: string         // optional link to a profile
  label: string              // human-friendly name
  /** Encrypted blob (AES-256-GCM ciphertext). */
  ciphertext: ArrayBuffer
  /** Encryption metadata — see 08-crypto-spec.md. */
  meta: CryptoMetadata
  createdAt: number
  rotatedAt?: number
}
```

`CryptoMetadata` is defined in [`08-crypto-spec.md`](./08-crypto-spec.md) §4.

### 2.5 `knownHosts` 🔒

```ts
interface KnownHostRecord {
  host: string               // "host:port"
  algorithm: string          // e.g. 'ssh-ed25519'
  /** Encrypted fingerprint (AES-256-GCM ciphertext). */
  ciphertext: ArrayBuffer
  meta: CryptoMetadata
  firstSeen: number
  pinnedAt: number
}
```

The fingerprint is encrypted with a subkey derived from the master key via
HKDF (§5 of the crypto spec), so the known-hosts DB is unreadable without the
master password.

### 2.6 `meta`

| Key | Value |
|-----|-------|
| `dbVersion` | current schema version |
| `kdf` | `{ algo: 'argon2id', params: {...}, salt: 'base64' }` |
| `keyId` | current master key id (for rotation) |

---

## 3. Secret-storage policy 🔒

1. **Passwords are never stored.** Not in any store, not in memory beyond the
   moment of use (FR-61, FR-100).
2. **Passphrases are never stored.** Used only to decrypt a key in memory,
   then zeroized (FR-104).
3. **Private keys are stored only when the user explicitly opts in** and only
   in encrypted form (`encryptedKeys`, FR-62).
4. **The master password is never stored** and never leaves the browser
   (FR-104, threat model §4).
5. **The derived encryption key** is a non-extractable `CryptoKey` held in
   memory by `useAuthStore` for the minimum lifetime required; auto-locked
   after idle (FR-105).
6. **Known-hosts are encrypted** with a subkey of the master key (HKDF).

---

## 4. Migration strategy

- The DB is versioned (`meta.dbVersion`). Each version has an
  `onupgradeneeded` handler that performs additive migrations.
- Migrations are forward-only; a downgrade path is not supported (documented).
- Before any destructive migration, the storage service exports a JSON backup
  of non-secret stores (`profiles`, `settings`) to a downloadable file on
  user request.
- Crypto envelope versioning (§4 of the crypto spec) is independent of DB
  versioning and supports algorithm rotation without a DB migration.

---

## 5. Quota & error handling

- Before large writes (e.g., saving a key), the storage service estimates
  size and checks `navigator.storage.estimate()`.
- On `QuotaExceededError`, the UI surfaces a clear message and offers to
  export profiles / clear old scrollback snapshots.
- Bounded data: scrollback snapshots (if ever persisted) are capped; profile
  count has no hard limit but is paginated in the UI.
- `navigator.storage.persist()` is requested on first unlock to reduce the
  chance of eviction.

---

## 6. Access patterns

| Operation | Store | Transaction |
|-----------|-------|-------------|
| List profiles | `profiles` | readonly, index `by-host` |
| Save profile | `profiles` | readwrite |
| Save encrypted key | `encryptedKeys` | readwrite |
| Load key for connection | `encryptedKeys` | readonly, index `by-profileId` |
| Lookup known host | `knownHosts` | readonly, key `host:port` |
| Pin known host | `knownHosts` | readwrite |
| Read settings | `settings` | readonly |
| Write settings | `settings` | readwrite |

All access goes through `services/storage.ts`, which enforces:
- schema validation (Zod) on read;
- encryption/decryption for `encryptedKeys` and `knownHosts` via `crypto/`;
- never returning decrypted secrets to callers outside `crypto/` and
  `services/`.

---

## 7. Security considerations

- **XSS:** an XSS in the SPA can read IndexedDB. Mitigated by CSP, Trusted
  Types, and the no-`v-html` rule (threat model §2.1). Secrets are encrypted
  at rest, so a read without the master password yields only ciphertext.
- **Lost device:** encrypted blobs are useless without the master password.
  Brute-force resistance comes from Argon2id (crypto spec §3).
- **Tampering:** AES-256-GCM authenticated encryption detects any
  modification (threat model §2.4).
- **Cross-origin:** same-origin policy prevents other origins from reading
  the DB; the SPA is served from the same origin as the backend.
- **Eviction:** `navigator.storage.persist()` reduces the risk of the browser
  evicting the DB under storage pressure.

---

## 8. Testing

- Unit tests for `services/storage.ts`: CRUD on each store, index lookups,
  migration handlers, quota-error path.
- Crypto round-trip: encrypt a key, store, read, decrypt, assert equality.
- Tamper test: flip a byte in `ciphertext`, assert decrypt fails.
- Migration test: create a DB at version N-1, open at version N, assert
  upgrade handler runs and data is preserved.
