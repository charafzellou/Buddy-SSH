import { describe, expect, it, vi } from 'vitest'
import { sendPublicKeyAuth } from './authSubmission'

describe('sendPublicKeyAuth', () => {
	it('sends the decoded key/passphrase as an AUTH message', () => {
		const send = vi.fn()
		const encoder = new TextEncoder()
		const submission = {
			key: encoder.encode('-----BEGIN OPENSSH PRIVATE KEY-----'),
			passphrase: encoder.encode('hunter2'),
		}

		sendPublicKeyAuth(send, () => 'req-1', submission)

		expect(send).toHaveBeenCalledWith({
			v: 1,
			id: 'req-1',
			type: 'AUTH',
			payload: {
				publickey: {
					key: '-----BEGIN OPENSSH PRIVATE KEY-----',
					passphrase: 'hunter2',
				},
			},
		})
	})

	it('zeroizes the key and passphrase buffers after sending', () => {
		const send = vi.fn()
		const encoder = new TextEncoder()
		const submission = {
			key: encoder.encode('plaintext-key-material'),
			passphrase: encoder.encode('plaintext-passphrase'),
		}

		sendPublicKeyAuth(send, () => 'req-1', submission)

		expect(submission.key.every((byte) => byte === 0)).toBe(true)
		expect(submission.passphrase.every((byte) => byte === 0)).toBe(true)
	})

	it('zeroizes the key buffer even if send throws', () => {
		const send = vi.fn(() => {
			throw new Error('socket closed')
		})
		const submission = { key: new TextEncoder().encode('plaintext-key-material') }

		expect(() => sendPublicKeyAuth(send, () => 'req-1', submission)).toThrow('socket closed')
		expect(submission.key.every((byte) => byte === 0)).toBe(true)
	})

	it('omits passphrase from the payload when not provided', () => {
		const send = vi.fn()
		const submission = { key: new TextEncoder().encode('key-only') }

		sendPublicKeyAuth(send, () => 'req-1', submission)

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: { publickey: { key: 'key-only', passphrase: undefined } },
			}),
		)
	})
})
