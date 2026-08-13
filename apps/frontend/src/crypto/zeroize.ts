// zeroize overwrites a buffer's contents with zeros in place. Best-effort:
// it cannot guarantee the underlying memory is scrubbed (the JS engine may
// have copied the bytes elsewhere, e.g. during GC compaction), and it
// cannot zero the plaintext string these bytes are decoded into to hand to
// an API that requires a string (msgpack encode, Go's `string` field) —
// JS strings are immutable, so that copy stays alive until garbage
// collected. Documented limitation, not a real security boundary.
//
// Accepts a raw ArrayBuffer too (not just a view) since some APIs (e.g.
// SubtleCrypto.decrypt) return plaintext as ArrayBuffer. Detects it via
// Object.prototype.toString's internal [[Class]] tag rather than
// `instanceof ArrayBuffer`, which is realm-sensitive and can silently fail
// across jsdom/Node global boundaries in tests (see services/storage.ts's
// deepToRaw for the bug this exact mistake caused).
export function zeroize(buffer: Uint8Array | ArrayBuffer): void {
	const view = Object.prototype.toString.call(buffer) === '[object ArrayBuffer]' ? new Uint8Array(buffer as ArrayBuffer) : (buffer as Uint8Array)
	view.fill(0)
}
