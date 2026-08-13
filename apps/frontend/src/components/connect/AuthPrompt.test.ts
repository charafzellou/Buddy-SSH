// @vitest-environment jsdom

import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthPrompt from './AuthPrompt.vue'

const unencryptedEd25519 = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCeY037NnCMOuG04ZVbdnMRMnT2pE7diP31sF71nunIiAAAAJjJ2tDqydrQ
6gAAAAtzc2gtZWQyNTUxOQAAACCeY037NnCMOuG04ZVbdnMRMnT2pE7diP31sF71nunIiA
AAAEC4IxC9x+sNwmJcHuxbVBsOt4IU+KZSatwLxwBLt7U/pp5jTfs2cIw64bThlVt2cxEy
dPakTt2I/fWwXvWe6ciIAAAADnRlc3RAYnVkZHktc3NoAQIDBAUGBw==
-----END OPENSSH PRIVATE KEY-----`

const encryptedEd25519 = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABCY27Hb3K
5f6z2mYL0BlhfxAAAAGAAAAAEAAAAzAAAAC3NzaC1lZDI1NTE5AAAAII0nFjJLxyqyZEhC
D7giQHwNkUZaFgK0fw9XqNiYJx1SAAAAoFxdj/ZGTXxsCwR5/TX/jujOwzyykjITFMo83C
gmuxZSbsxFz6dhk3iqxi9oL1MHnSt+lmbE6blFqJpmrUGxfjXcm2PyZL1NIjoKE+iAyj1e
hRuyAatSR7Bz+5m95UlpYUmfkvGiCTn3RU0aIa2GJJrW8IQ54YGK7yDqqaesCf2AKCIBVU
GQwY1Qp6gdlLuWiYz0g/qtwfmlTly6ObmQ4E8=
-----END OPENSSH PRIVATE KEY-----`

async function flush(): Promise<void> {
	await nextTick()
	await nextTick()
}

describe('AuthPrompt', () => {
	let root: HTMLDivElement

	beforeEach(() => {
		root = document.createElement('div')
		document.body.appendChild(root)
	})

	afterEach(() => {
		root.remove()
	})

	it('reads a key from an uploaded file into the textarea', async () => {
		const app = createApp(AuthPrompt, { open: true, mode: 'publickey' })
		app.mount(root)
		await flush()

		const fileInput = root.querySelector('input[type="file"]') as HTMLInputElement
		const file = new File([unencryptedEd25519], 'id_ed25519', { type: 'text/plain' })
		Object.defineProperty(fileInput, 'files', { value: [file] })
		fileInput.dispatchEvent(new Event('change'))

		await vi.waitUntil(() => (root.querySelector('textarea') as HTMLTextAreaElement).value !== '')

		const textarea = root.querySelector('textarea') as HTMLTextAreaElement
		expect(textarea.value).toContain('BEGIN OPENSSH PRIVATE KEY')

		app.unmount()
	})

	it('shows a masked passphrase field once an encrypted key is detected, and submits key+passphrase', async () => {
		const onSubmitKey = vi.fn()
		const app = createApp(AuthPrompt, { open: true, mode: 'publickey', onSubmitKey })
		app.mount(root)
		await flush()

		const textarea = root.querySelector('textarea') as HTMLTextAreaElement
		textarea.value = encryptedEd25519
		textarea.dispatchEvent(new Event('input'))
		await flush()

		const passphraseInput = root.querySelector('input[type="password"]') as HTMLInputElement
		expect(passphraseInput).not.toBeNull()

		passphraseInput.value = 'correct horse'
		passphraseInput.dispatchEvent(new Event('input'))
		await flush()

		root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
		await flush()

		expect(onSubmitKey).toHaveBeenCalledTimes(1)
		const submission = onSubmitKey.mock.calls[0]?.[0]
		const decoder = new TextDecoder()
		expect(decoder.decode(submission.key)).toBe(encryptedEd25519)
		expect(decoder.decode(submission.passphrase)).toBe('correct horse')

		app.unmount()
	})

	it('disables submit for an invalid key', async () => {
		const onSubmitKey = vi.fn()
		const app = createApp(AuthPrompt, { open: true, mode: 'publickey', onSubmitKey })
		app.mount(root)
		await flush()

		const textarea = root.querySelector('textarea') as HTMLTextAreaElement
		textarea.value = 'not a real key'
		textarea.dispatchEvent(new Event('input'))
		await flush()

		const submitButton = root.querySelector('button[type="submit"]') as HTMLButtonElement
		expect(submitButton.disabled).toBe(true)

		root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
		await flush()
		expect(onSubmitKey).not.toHaveBeenCalled()

		app.unmount()
	})

	it('renders N keyboard-interactive prompts with per-prompt echo, and submits ordered responses', async () => {
		const onSubmitResponses = vi.fn()
		const challenge = {
			name: 'Two-factor',
			instructions: 'Enter your verification code',
			prompts: [
				{ text: 'Password:', echo: false },
				{ text: 'Verification code:', echo: true },
				{ text: 'Backup code:', echo: false },
			],
		}
		const app = createApp(AuthPrompt, {
			open: true,
			mode: 'kbdInteractive',
			challenge,
			onSubmitResponses,
		})
		app.mount(root)
		await flush()

		expect(root.textContent).toContain('Enter your verification code')
		const inputs = root.querySelectorAll('input')
		expect(inputs).toHaveLength(3)
		expect(inputs[0]?.type).toBe('password')
		expect(inputs[1]?.type).toBe('text')
		expect(inputs[2]?.type).toBe('password')

		inputs[0].value = 'hunter2'
		inputs[0].dispatchEvent(new Event('input'))
		inputs[1].value = '123456'
		inputs[1].dispatchEvent(new Event('input'))
		inputs[2].value = 'backup-9'
		inputs[2].dispatchEvent(new Event('input'))
		await flush()

		root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
		await flush()

		expect(onSubmitResponses).toHaveBeenCalledWith({ responses: ['hunter2', '123456', 'backup-9'] })

		app.unmount()
	})

	it('emits cancel and update:open(false) when closed', async () => {
		const onCancel = vi.fn()
		const onUpdateOpen = vi.fn()
		const app = createApp(AuthPrompt, {
			open: true,
			mode: 'publickey',
			onCancel,
			'onUpdate:open': onUpdateOpen,
		})
		app.mount(root)
		await flush()

		root.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		expect(onCancel).toHaveBeenCalledTimes(1)
		expect(onUpdateOpen).toHaveBeenCalledWith(false)

		app.unmount()
	})
})
