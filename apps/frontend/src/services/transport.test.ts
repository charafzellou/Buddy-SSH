import type { BuddySshMessage } from '@buddy-ssh/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeProtocolMessage, encodeProtocolMessage } from './protocol'
import { WebSocketTransport } from './transport'

describe('WebSocketTransport', () => {
  let socket: FakeWebSocket
  let transport: WebSocketTransport
  const statusMessages: BuddySshMessage[] = []
  const dataMessages: BuddySshMessage[] = []
  const errors: unknown[] = []

  beforeEach(() => {
    socket = new FakeWebSocket()
    transport = new WebSocketTransport({
      url: 'ws://localhost:8443/ws',
      token: 'dev-token',
      encoding: 'msgpack',
      webSocketFactory: (_url, protocols) => {
        socket.protocols = protocols
        return socket
      },
    })
    transport.onStatus = (message) => {
      statusMessages.push(message)
    }
    transport.onData = (message) => {
      dataMessages.push(message)
    }
    transport.onError = (error) => {
      errors.push(error)
    }
  })

  it('connects, sends INIT, receives CONNECTED and DATA, and closes', async () => {
    const connectPromise = transport.connect()
    socket.open()
    await connectPromise

    expect(socket.protocols).toEqual(['buddy-ssh.msgpack', 'buddy-ssh.auth.dev-token'])

    const initMessage: BuddySshMessage = {
      v: 1,
      type: 'INIT',
      payload: {
        authMethod: 'password',
        hostKey: { mode: 'first-use' },
        pty: { term: 'xterm-256color', cols: 80, rows: 24 },
        target: { host: 'example.com', port: 22, username: 'ops' },
      },
    }
    transport.send(initMessage)

    expect(decodeProtocolMessage(socket.sent[0] as Uint8Array, 'msgpack')).toEqual(initMessage)

    const connectedMessage: BuddySshMessage = {
      v: 1,
      type: 'CONNECTED',
      payload: {
        hostKey: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:example' },
        serverId: 'server-1',
        sessionId: 'session-1',
      },
    }
    socket.emitMessage(encodeProtocolMessage(connectedMessage, 'msgpack'))

    const dataMessage: BuddySshMessage = {
      v: 1,
      type: 'DATA',
      payload: { data: [1, 2, 3] },
    }
    socket.emitMessage(encodeProtocolMessage(dataMessage, 'msgpack'))

    await vi.waitFor(() => {
      expect(statusMessages).toContainEqual(connectedMessage)
      expect(dataMessages).toContainEqual(dataMessage)
    })

    transport.close()
    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'client close' }])
    expect(errors).toEqual([])
    expect(statusMessages.at(-1)).toEqual({
      v: 1,
      type: 'DISCONNECT',
      payload: { reason: 'client_close' },
    })
  })
})

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  binaryType: BinaryType = 'blob'
  readyState = FakeWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  protocols: string[] = []
  sent: Array<string | ArrayBufferLike | ArrayBufferView | Blob> = []
  closeCalls: Array<{ code?: number; reason?: string }> = []

  constructor(url?: string, protocols?: string[]) {
    void url
    if (protocols) {
      this.protocols = protocols
    }
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  send(data: string | ArrayBufferLike | ArrayBufferView | Blob): void {
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    this.readyState = FakeWebSocket.CLOSED
    this.closeCalls.push({ code, reason })
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' } as CloseEvent)
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}
