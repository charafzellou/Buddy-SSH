import { type BuddySshMessage, messageUnionSchema } from '@buddy-ssh/shared'
import { decode as decodeMessagePack, encode as encodeMessagePack } from '@msgpack/msgpack'

export type ProtocolEncoding = 'msgpack' | 'json'
export type EncodedProtocolMessage = Uint8Array | string

// encodeProtocolMessage serializes a validated Buddy-SSH message for the wire.
export function encodeProtocolMessage(
  message: BuddySshMessage,
  encoding: ProtocolEncoding,
): EncodedProtocolMessage {
  const parsed = messageUnionSchema.parse(message)

  if (encoding === 'msgpack') {
    return encodeMessagePack(toWireBinaryPayload(parsed))
  }

  return JSON.stringify(parsed)
}

// toWireBinaryPayload converts DATA/STDERR byte arrays to Uint8Array so
// @msgpack/msgpack encodes them as msgpack "bin" (matching the Go backend's
// []byte decode), instead of a msgpack "array" of integers.
function toWireBinaryPayload(message: BuddySshMessage): unknown {
  if (message.type !== 'DATA' && message.type !== 'STDERR') {
    return message
  }

  return {
    ...message,
    payload: {
      ...message.payload,
      data: Uint8Array.from(message.payload.data),
    },
  }
}

// decodeProtocolMessage parses and validates one Buddy-SSH message from the wire.
export function decodeProtocolMessage(
  payload: ArrayBuffer | ArrayBufferView | string,
  encoding: ProtocolEncoding,
): BuddySshMessage {
  const decoded = decodeWirePayload(payload, encoding)
  const normalized = normalizeBinaryPayload(decoded)

  return messageUnionSchema.parse(normalized)
}

function decodeWirePayload(
  payload: ArrayBuffer | ArrayBufferView | string,
  encoding: ProtocolEncoding,
): unknown {
  if (encoding === 'msgpack') {
    return decodeMessagePack(asUint8Array(payload))
  }

  if (typeof payload !== 'string') {
    throw new TypeError('JSON protocol payloads must be strings')
  }

  return JSON.parse(payload) as unknown
}

function asUint8Array(payload: ArrayBuffer | ArrayBufferView | string): Uint8Array {
  if (payload instanceof Uint8Array) {
    return payload
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload)
  }

  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
  }

  throw new TypeError('MessagePack protocol payloads must be binary')
}

function normalizeBinaryPayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) {
    return payload
  }

  const message = payload as { type?: string; payload?: Record<string, unknown> }
  if (message.type === 'DATA' || message.type === 'STDERR') {
    const binaryPayload = message.payload?.data
    if (binaryPayload instanceof Uint8Array) {
      return {
        ...message,
        payload: {
          ...message.payload,
          data: Array.from(binaryPayload),
        },
      }
    }
  }

  return payload
}
