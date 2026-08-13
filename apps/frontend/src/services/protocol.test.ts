import type { BuddySshMessage } from '@buddy-ssh/shared'
import { decode as decodeMessagePackRaw } from '@msgpack/msgpack'
import { describe, expect, it } from 'vitest'
import { decodeProtocolMessage, encodeProtocolMessage } from './protocol'

describe('protocol service', () => {
  it.each(['msgpack', 'json'] as const)('round-trips all message types with %s', (encoding) => {
    for (const message of protocolFixtures()) {
      const encoded = encodeProtocolMessage(message, encoding)
      const decoded = decodeProtocolMessage(encoded, encoding)

      expect(decoded).toEqual(message)
    }
  })

  it.each(['DATA', 'STDERR'] as const)(
    // Regression test for M1.11.1: the frontend's byteArraySchema represents
    // bytes as number[], but @msgpack/msgpack only emits the msgpack "bin"
    // format (matching Go's []byte decode) for Uint8Array values. Encoding a
    // plain number[] instead produced a msgpack "array", which the backend's
    // vmihailenco/msgpack decoder rejected with a policy-violation close as
    // soon as the first keystroke was typed.
    'encodes %s bytes using msgpack bin format, not array',
    (type) => {
      const message = { v: 1, id: 'req-1', type, payload: { data: [1, 2, 3] } } as BuddySshMessage
      const encoded = encodeProtocolMessage(message, 'msgpack') as Uint8Array

      const raw = decodeMessagePackRaw(encoded) as { payload: { data: unknown } }
      expect(raw.payload.data).toBeInstanceOf(Uint8Array)
    },
  )

  it.each(['msgpack', 'json'] as const)('throws on invalid payload with %s', (encoding) => {
    const malformed: BuddySshMessage = {
      v: 1,
      type: 'INIT',
      payload: {
        authMethod: 'password',
        hostKey: { mode: 'first-use' },
        pty: { term: 'xterm-256color', cols: 0, rows: 24 },
        target: { host: '', port: 22, username: 'ops' },
      },
    }

    expect(() => encodeProtocolMessage(malformed, encoding)).toThrow()
  })
})

function protocolFixtures(): BuddySshMessage[] {
  return [
    {
      v: 1,
      id: 'req-1',
      type: 'INIT',
      payload: {
        authMethod: 'password',
        client: { version: '0.1.0' },
        hostKey: { mode: 'pinned', fingerprint: 'SHA256:example', algorithm: 'ssh-ed25519' },
        pty: { term: 'xterm-256color', cols: 80, rows: 24 },
        target: { host: 'example.com', port: 22, username: 'ops' },
      },
    },
    {
      v: 1,
      id: 'req-1',
      type: 'AUTH',
      payload: {
        password: 'top-secret',
        publickey: { key: '-----BEGIN OPENSSH PRIVATE KEY-----', passphrase: 'key-secret' },
        kbdInteractive: { challengeId: 'challenge-1', responses: ['otp'] },
      },
    },
    {
      v: 1,
      id: 'req-1',
      type: 'CONNECT',
      payload: {
        command: 'uptime',
        env: { LANG: 'en_US.UTF-8' },
      },
    },
    {
      v: 1,
      id: 'req-1',
      type: 'CONNECTED',
      payload: {
        hostKey: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:example' },
        serverId: 'server-1',
        sessionId: 'session-1',
      },
    },
    { v: 1, id: 'req-1', type: 'DATA', payload: { data: [1, 2, 3] } },
    { v: 1, id: 'req-1', type: 'STDERR', payload: { data: [4, 5, 6] } },
    {
      v: 1,
      id: 'req-1',
      type: 'RESIZE',
      payload: { cols: 120, rows: 40, pixelWidth: 1280, pixelHeight: 720 },
    },
    { v: 1, id: 'req-1', type: 'PING', payload: { timestamp: 12345 } },
    { v: 1, id: 'req-1', type: 'PONG', payload: { timestamp: 12345, serverTime: 12346 } },
    { v: 1, id: 'req-1', type: 'KEEPALIVE', payload: {} },
    { v: 1, id: 'req-1', type: 'STATUS', payload: { state: 'connected', message: 'ready' } },
    {
      v: 1,
      id: 'req-1',
      type: 'STATUS',
      payload: {
        state: 'connecting',
        challenge: {
          name: 'Two-factor',
          instructions: 'Enter your verification code',
          prompts: [{ text: 'Verification code:', echo: true }],
        },
      },
    },
    { v: 1, id: 'req-1', type: 'ERROR', payload: { code: 'INTERNAL', message: 'boom' } },
    { v: 1, id: 'req-1', type: 'DISCONNECT', payload: { reason: 'client_close' } },
  ]
}
