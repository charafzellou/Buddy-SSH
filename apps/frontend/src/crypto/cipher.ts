export interface EncryptResult {
	ciphertext: ArrayBuffer
	nonce: Uint8Array
}

// encrypt performs AES-256-GCM authenticated encryption with a fresh
// random 96-bit nonce per call — nonces must never be reused with the same
// key (08-crypto-spec.md §4).
export async function encrypt(key: CryptoKey, plaintext: Uint8Array, aad?: Uint8Array): Promise<EncryptResult> {
	const nonce = crypto.getRandomValues(new Uint8Array(12))
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce, additionalData: aad },
		key,
		plaintext,
	)
	return { ciphertext, nonce }
}

export async function decrypt(
	key: CryptoKey,
	ciphertext: ArrayBuffer,
	nonce: Uint8Array,
	aad?: Uint8Array,
): Promise<Uint8Array> {
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, ciphertext)
	return new Uint8Array(plaintext)
}
