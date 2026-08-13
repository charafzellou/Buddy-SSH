import forge from 'node-forge'

export interface ParsedSshKeyInfo {
  type: string
  comment: string
}

export type SshKeyParseResult =
  | { status: 'ok'; info: ParsedSshKeyInfo }
  | { status: 'encrypted'; info?: Pick<ParsedSshKeyInfo, 'type'> }
  | { status: 'invalid'; message: string }

const openSshMagic = 'openssh-key-v1\0'

// parseSshPrivateKey validates and inspects a private key client-side for
// UX purposes only (instant "this doesn't look like a valid key" feedback
// and detecting whether to show a passphrase field). It is not a security
// boundary: the backend re-parses and authenticates with the key
// authoritatively via golang.org/x/crypto/ssh.
//
// OpenSSH-format keys (openssh-key-v1 — the ssh-keygen default, and the
// only format ed25519 keys can be stored in) are parsed with a small
// hand-rolled structural reader: the public-key section of that format is
// always cleartext even when the private section is encrypted, so type
// and encrypted-or-not can be determined without any crypto/passphrase.
// Traditional PEM/PKCS1/PKCS8 keys are validated via node-forge, which
// (unlike sshpk, tried first — see ADR-0002 addendum) is genuinely
// browser-safe with no Node-builtin polyfills required.
export function parseSshPrivateKey(keyText: string, passphrase?: string): SshKeyParseResult {
  const trimmed = keyText.trim()
  if (trimmed === '') {
    return { status: 'invalid', message: 'Key is empty' }
  }

  if (trimmed.includes('BEGIN OPENSSH PRIVATE KEY')) {
    return parseOpenSshKey(trimmed)
  }

  if (trimmed.includes('PRIVATE KEY-----')) {
    return parsePemKey(trimmed, passphrase)
  }

  return { status: 'invalid', message: 'Unrecognized key format' }
}

function parseOpenSshKey(pemText: string): SshKeyParseResult {
  const body = extractPemBody(pemText, 'OPENSSH PRIVATE KEY')
  if (!body) {
    return { status: 'invalid', message: 'Malformed OpenSSH key block' }
  }

  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(body)
  } catch {
    return { status: 'invalid', message: 'Invalid base64 in key body' }
  }

  try {
    const reader = new BinaryReader(bytes)
    const magic = reader.readFixedString(openSshMagic.length)
    if (magic !== openSshMagic) {
      return { status: 'invalid', message: 'Not a valid OpenSSH key (bad magic)' }
    }

    const cipherName = reader.readString()
    reader.readString() // kdfname
    reader.readBytes() // kdfoptions
    const numKeys = reader.readUint32()
    if (numKeys < 1) {
      return { status: 'invalid', message: 'OpenSSH key contains no keys' }
    }

    const pubKeyBlob = reader.readBytes()
    const keyType = new BinaryReader(pubKeyBlob).readString()

    if (cipherName !== 'none') {
      return { status: 'encrypted', info: { type: sshKeyTypeLabel(keyType) } }
    }

    return { status: 'ok', info: { type: sshKeyTypeLabel(keyType), comment: '' } }
  } catch {
    return { status: 'invalid', message: 'Malformed OpenSSH key structure' }
  }
}

function parsePemKey(pemText: string, passphrase?: string): SshKeyParseResult {
  let decoded: forge.pem.ObjectPEM
  try {
    const messages = forge.pem.decode(pemText)
    const first = messages[0]
    if (!first) {
      throw new Error('empty PEM')
    }
    decoded = first
  } catch (error) {
    return {
      status: 'invalid',
      message: error instanceof Error ? error.message : 'Malformed PEM block',
    }
  }

  const isEncrypted = decoded.type.includes('ENCRYPTED') || decoded.procType?.type === 'ENCRYPTED'
  if (isEncrypted && !passphrase) {
    return { status: 'encrypted', info: { type: pemTypeLabel(decoded.type) } }
  }

  try {
    if (decoded.type === 'RSA PRIVATE KEY' && isEncrypted && passphrase) {
      const key = forge.pki.decryptRsaPrivateKey(pemText, passphrase)
      if (!key) {
        return { status: 'invalid', message: 'Wrong passphrase or corrupt key' }
      }
    } else if (decoded.type === 'RSA PRIVATE KEY') {
      forge.pki.privateKeyFromPem(pemText)
    } else {
      // EC/PKCS8 keys: structural ASN.1 validation (forge doesn't fully
      // parse every PKCS8 algorithm, but a DER parse still catches
      // truncated/garbage input).
      forge.asn1.fromDer(decoded.body)
    }
  } catch (error) {
    return {
      status: 'invalid',
      message: error instanceof Error ? error.message : 'Invalid key or wrong passphrase',
    }
  }

  return { status: 'ok', info: { type: pemTypeLabel(decoded.type), comment: '' } }
}

function sshKeyTypeLabel(keyType: string): string {
  if (keyType === 'ssh-ed25519') {
    return 'ed25519'
  }
  if (keyType === 'ssh-rsa') {
    return 'rsa'
  }
  if (keyType.startsWith('ecdsa-sha2-')) {
    return 'ecdsa'
  }

  return keyType
}

function pemTypeLabel(type: string): string {
  if (type.includes('RSA')) {
    return 'rsa'
  }
  if (type.includes('EC')) {
    return 'ec'
  }
  if (type.includes('DSA')) {
    return 'dsa'
  }

  return 'unknown'
}

function extractPemBody(pemText: string, label: string): string | null {
  const pattern = new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`)
  const match = pemText.match(pattern)
  return match?.[1] ? match[1].replace(/\s+/g, '') : null
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

// BinaryReader reads the big-endian, length-prefixed fields used by the
// SSH wire format (RFC 4251 §5) that the openssh-key-v1 container reuses.
class BinaryReader {
  private offset = 0
  constructor(private readonly bytes: Uint8Array) {}

  readFixedString(length: number): string {
    const slice = this.take(length)
    return String.fromCharCode(...slice)
  }

  readUint32(): number {
    const slice = this.take(4)
    return new DataView(slice.buffer, slice.byteOffset, slice.byteLength).getUint32(0)
  }

  readBytes(): Uint8Array {
    const length = this.readUint32()
    return this.take(length)
  }

  readString(): string {
    const slice = this.readBytes()
    return String.fromCharCode(...slice)
  }

  private take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new RangeError('unexpected end of key data')
    }
    const slice = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return slice
  }
}
