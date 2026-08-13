export interface EncryptResult {
  ciphertext: ArrayBuffer
  nonce: Uint8Array<ArrayBuffer>
}

// encrypt performs AES-256-GCM authenticated encryption with a fresh
// random 96-bit nonce per call — nonces must never be reused with the same
// key (08-crypto-spec.md §4).
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<EncryptResult> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const data: Uint8Array<ArrayBuffer> = Uint8Array.from(plaintext)
  const additionalData: Uint8Array<ArrayBuffer> | undefined = aad ? Uint8Array.from(aad) : undefined
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData },
    key,
    data,
  )
  return { ciphertext, nonce }
}

export async function decrypt(
  key: CryptoKey,
  ciphertext: ArrayBuffer,
  nonce: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const iv: Uint8Array<ArrayBuffer> = Uint8Array.from(nonce)
  const additionalData: Uint8Array<ArrayBuffer> | undefined = aad ? Uint8Array.from(aad) : undefined
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData },
    key,
    ciphertext,
  )
  return new Uint8Array(plaintext)
}
