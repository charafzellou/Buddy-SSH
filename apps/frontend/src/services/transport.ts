import type { BuddySshMessage } from '@buddy-ssh/shared'
import type { EncodedProtocolMessage, ProtocolEncoding } from './protocol'
import { decodeProtocolMessage, encodeProtocolMessage } from './protocol'

const authSubprotocolPrefix = 'buddy-ssh.auth.'

type DataMessage = Extract<BuddySshMessage, { type: 'DATA' | 'STDERR' }>
type StatusMessage = Extract<
  BuddySshMessage,
  { type: 'CONNECTED' | 'DISCONNECT' | 'KEEPALIVE' | 'PONG' | 'STATUS' }
>
type ErrorMessage = Extract<BuddySshMessage, { type: 'ERROR' }>

export interface WebSocketLike {
  readonly readyState: number
  binaryType: BinaryType
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string | ArrayBufferLike | ArrayBufferView | Blob): void
  close(code?: number, reason?: string): void
}

export interface TransportOptions {
  url: string
  token: string
  encoding?: ProtocolEncoding
  webSocketFactory?: (url: string, protocols: string[]) => WebSocketLike
}

// WebSocketTransport manages one Buddy-SSH websocket session from the browser.
export class WebSocketTransport {
  onData?: (message: DataMessage) => void
  onStatus?: (message: StatusMessage) => void
  onError?: (error: Error | ErrorMessage) => void

  private readonly encoding: ProtocolEncoding
  private readonly token: string
  private readonly url: string
  private readonly webSocketFactory: (url: string, protocols: string[]) => WebSocketLike
  private socket: WebSocketLike | null = null

  constructor(options: TransportOptions) {
    this.encoding = options.encoding ?? 'msgpack'
    this.token = options.token.trim()
    this.url = options.url
    this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return
    }

    const socket = this.webSocketFactory(
      this.url,
      buildWebSocketProtocols(this.encoding, this.token),
    )
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    return new Promise((resolve, reject) => {
      socket.onopen = () => resolve()
      socket.onerror = () => {
        const error = new Error('WebSocket connection failed')
        this.onError?.(error)
        reject(error)
      }
      socket.onmessage = (event) => {
        void this.handleMessage(event.data)
      }
    socket.onclose = (event) => {
      if (event.code !== 1000) {
        // Surfaced (not swallowed) so an unexpected server-side close is
        // visible; the server's close reason (e.g. a protocol/decode error)
        // is otherwise discarded by the generic DISCONNECT status below.
        console.warn('[transport] socket closed unexpectedly', {
          code: event.code,
          reason: event.reason,
        })
      }
      this.onStatus?.({
        v: 1,
        type: 'DISCONNECT',
        payload: {
          reason: event.code === 1000 ? 'client_close' : 'error',
        },
      })
        this.socket = null
      }
    })
  }

  send(message: BuddySshMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    const encoded = encodeProtocolMessage(message, this.encoding)
    this.socket.send(toSocketPayload(encoded))
  }

  close(code = 1000, reason = 'client close'): void {
    this.socket?.close(code, reason)
  }

  private async handleMessage(payload: unknown): Promise<void> {
    try {
      const decoded = decodeProtocolMessage(await normalizeIncomingPayload(payload), this.encoding)
      switch (decoded.type) {
        case 'DATA':
        case 'STDERR':
          this.onData?.(decoded)
          return
        case 'CONNECTED':
        case 'DISCONNECT':
        case 'KEEPALIVE':
        case 'PONG':
        case 'STATUS':
          this.onStatus?.(decoded)
          return
        case 'ERROR':
          this.onError?.(decoded)
          return
        default:
          return
      }
    } catch (error) {
      this.onError?.(
        error instanceof Error ? error : new Error('Failed to decode websocket payload'),
      )
    }
  }
}

export function buildWebSocketProtocols(encoding: ProtocolEncoding, token: string): string[] {
  const normalizedToken = token.trim()
  if (normalizedToken === '' || /[\s,]/.test(normalizedToken)) {
    throw new TypeError('WebSocket token must be non-empty and free of whitespace or commas')
  }

  return [
    encoding === 'msgpack' ? 'buddy-ssh.msgpack' : 'buddy-ssh.json',
    `${authSubprotocolPrefix}${normalizedToken}`,
  ]
}

function defaultWebSocketFactory(url: string, protocols: string[]): WebSocketLike {
  return new WebSocket(url, protocols)
}

function toSocketPayload(
  payload: EncodedProtocolMessage,
): string | ArrayBufferLike | ArrayBufferView {
  if (typeof payload === 'string') {
    return payload
  }

  return payload
}

async function normalizeIncomingPayload(
  payload: unknown,
): Promise<ArrayBuffer | ArrayBufferView | string> {
  if (typeof payload === 'string') {
    return payload
  }

  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
    return payload
  }

  if (payload instanceof Blob) {
    return await payload.arrayBuffer()
  }

  throw new TypeError('Unsupported websocket payload type')
}
