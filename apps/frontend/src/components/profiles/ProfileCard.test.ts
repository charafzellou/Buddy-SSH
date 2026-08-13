// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import type { Profile } from '@/services/storage'
import ProfileCard from './ProfileCard.vue'

const profile: Profile = {
  id: 'profile-1',
  nickname: 'Prod box',
  host: 'example.com',
  port: 22,
  username: 'ops',
  authType: 'password',
  tags: ['prod', 'web'],
  color: '#38bdf8',
  terminalPrefs: {},
  connectionPrefs: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

describe('ProfileCard', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  it('renders nickname, destination, and tags', () => {
    const app = createApp(ProfileCard, { profile })
    app.mount(root)

    expect(root.textContent).toContain('Prod box')
    expect(root.textContent).toContain('ops@example.com:22')
    expect(root.textContent).toContain('prod')
    expect(root.textContent).toContain('web')

    app.unmount()
  })

  it('emits connect when the card is clicked', () => {
    const onConnect = vi.fn()
    const app = createApp(ProfileCard, { profile, onConnect })
    app.mount(root)

    root.querySelector('[role="button"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onConnect).toHaveBeenCalledWith(profile)
    app.unmount()
  })

  it('emits edit (not connect) when the edit button is clicked', () => {
    const onConnect = vi.fn()
    const onEdit = vi.fn()
    const app = createApp(ProfileCard, { profile, onConnect, onEdit })
    app.mount(root)

    root.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onEdit).toHaveBeenCalledWith(profile)
    expect(onConnect).not.toHaveBeenCalled()
    app.unmount()
  })
})
