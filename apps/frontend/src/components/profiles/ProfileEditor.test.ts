// @vitest-environment jsdom

import type { Profile } from '@/services/storage'
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfileEditor from './ProfileEditor.vue'

describe('ProfileEditor', () => {
	let root: HTMLDivElement

	beforeEach(() => {
		root = document.createElement('div')
		document.body.appendChild(root)
	})

	afterEach(() => {
		root.remove()
	})

	it('creates a new profile from filled-in fields', async () => {
		const onSave = vi.fn()
		const app = createApp(ProfileEditor, { open: true, onSave })
		app.mount(root)
		await nextTick()

		const inputs = root.querySelectorAll('input')
		const nickname = inputs[0] as HTMLInputElement
		const host = inputs[1] as HTMLInputElement
		const port = inputs[2] as HTMLInputElement
		const username = inputs[3] as HTMLInputElement

		nickname.value = 'Prod box'
		nickname.dispatchEvent(new Event('input'))
		host.value = 'example.com'
		host.dispatchEvent(new Event('input'))
		port.value = '2222'
		port.dispatchEvent(new Event('input'))
		username.value = 'ops'
		username.dispatchEvent(new Event('input'))
		await nextTick()

		root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
		await nextTick()

		expect(onSave).toHaveBeenCalledTimes(1)
		const saved = onSave.mock.calls[0]?.[0] as Profile
		expect(saved.nickname).toBe('Prod box')
		expect(saved.host).toBe('example.com')
		expect(saved.port).toBe(2222)
		expect(saved.username).toBe('ops')
		expect(saved.id).toBeTruthy()

		app.unmount()
	})

	it('disables save until nickname, host, and username are all filled in', async () => {
		const onSave = vi.fn()
		const app = createApp(ProfileEditor, { open: true, onSave })
		app.mount(root)
		await nextTick()

		const submitButton = root.querySelector('button[type="submit"]') as HTMLButtonElement
		expect(submitButton.disabled).toBe(true)

		root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
		expect(onSave).not.toHaveBeenCalled()

		app.unmount()
	})

	it('pre-fills fields from an existing profile and preserves its id on save', async () => {
		const existing: Profile = {
			id: 'profile-1',
			nickname: 'Old name',
			host: 'old.example.com',
			port: 22,
			username: 'ops',
			authType: 'publickey',
			tags: ['prod', 'db'],
			terminalPrefs: {},
			connectionPrefs: {},
			createdAt: 1000,
			updatedAt: 1000,
		}
		const onSave = vi.fn()
		const app = createApp(ProfileEditor, { open: true, profile: existing, onSave })
		app.mount(root)
		await nextTick()

		expect(root.textContent).toContain('Edit profile')
		const nickname = root.querySelectorAll('input')[0] as HTMLInputElement
		expect(nickname.value).toBe('Old name')

		root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
		await nextTick()

		const saved = onSave.mock.calls[0]?.[0] as Profile
		expect(saved.id).toBe('profile-1')
		expect(saved.tags).toEqual(['prod', 'db'])
		expect(saved.createdAt).toBe(1000)
		expect(saved.updatedAt).toBeGreaterThan(1000)

		app.unmount()
	})

	it('emits cancel and update:open(false) when closed', async () => {
		const onCancel = vi.fn()
		const onUpdateOpen = vi.fn()
		const app = createApp(ProfileEditor, { open: true, onCancel, 'onUpdate:open': onUpdateOpen })
		app.mount(root)
		await nextTick()

		root.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		expect(onCancel).toHaveBeenCalledTimes(1)
		expect(onUpdateOpen).toHaveBeenCalledWith(false)

		app.unmount()
	})
})
