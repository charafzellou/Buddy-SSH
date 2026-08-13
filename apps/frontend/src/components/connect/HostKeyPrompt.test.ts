// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import HostKeyPrompt from './HostKeyPrompt.vue'

describe('HostKeyPrompt', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  it('renders the host, algorithm, and fingerprint', () => {
    const app = createApp(HostKeyPrompt, {
      open: true,
      host: 'example.com:22',
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:abc123',
    })
    app.mount(root)

    expect(root.textContent).toContain('example.com:22')
    expect(root.textContent).toContain('ssh-ed25519')
    expect(root.textContent).toContain('SHA256:abc123')

    app.unmount()
  })

  it('renders nothing when closed', () => {
    const app = createApp(HostKeyPrompt, {
      open: false,
      host: 'example.com:22',
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:abc123',
    })
    app.mount(root)

    expect(root.textContent?.trim()).toBe('')

    app.unmount()
  })

  it('emits accept when "Trust & Pin" is clicked', () => {
    const onAccept = vi.fn()
    const app = createApp(HostKeyPrompt, {
      open: true,
      host: 'example.com:22',
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:abc123',
      onAccept,
    })
    app.mount(root)

    const buttons = root.querySelectorAll('button')
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onAccept).toHaveBeenCalledTimes(1)
    app.unmount()
  })

  it('emits reject when "Reject & Disconnect" is clicked', () => {
    const onReject = vi.fn()
    const app = createApp(HostKeyPrompt, {
      open: true,
      host: 'example.com:22',
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:abc123',
      onReject,
    })
    app.mount(root)

    const buttons = root.querySelectorAll('button')
    buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onReject).toHaveBeenCalledTimes(1)
    app.unmount()
  })
})
