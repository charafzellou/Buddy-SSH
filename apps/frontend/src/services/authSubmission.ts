import { zeroize } from '@/crypto/zeroize'
import type { BuddySshMessage } from '@buddy-ssh/shared'

export interface PublicKeySubmission {
	key: Uint8Array
	passphrase?: Uint8Array
}

// sendPublicKeyAuth decodes the key/passphrase buffers only for the
// duration of the AUTH send, then zeroizes them (M3.3.2 — decrypted key
// material should live in memory only for the send).
export function sendPublicKeyAuth(
	send: (message: BuddySshMessage) => void,
	createId: () => string,
	submission: PublicKeySubmission,
): void {
	const decoder = new TextDecoder()
	try {
		send({
			v: 1,
			id: createId(),
			type: 'AUTH',
			payload: {
				publickey: {
					key: decoder.decode(submission.key),
					passphrase: submission.passphrase ? decoder.decode(submission.passphrase) : undefined,
				},
			},
		})
	} finally {
		zeroize(submission.key)
		if (submission.passphrase) {
			zeroize(submission.passphrase)
		}
	}
}
