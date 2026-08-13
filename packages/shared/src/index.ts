import * as z from 'zod'

export const protocolVersion = 1 as const

export const messageTypeSchema = z.enum([
  'INIT',
  'AUTH',
  'CONNECT',
  'CONNECTED',
  'DATA',
  'STDERR',
  'RESIZE',
  'PING',
  'PONG',
  'KEEPALIVE',
  'STATUS',
  'ERROR',
  'DISCONNECT',
])

export type MessageType = z.infer<typeof messageTypeSchema>

const byteSchema = z.number().int().min(0).max(255)
export const byteArraySchema = z.array(byteSchema)

export const connectionStateSchema = z.enum([
  'connecting',
  'connected',
  'reconnecting',
  'disconnected',
  'error',
])

export const errorCodeSchema = z.enum([
  'PROTOCOL_VERSION',
  'PROTOCOL_VIOLATION',
  'AUTH_FAILED',
  'AUTH_REQUIRED',
  'HOST_KEY_MISMATCH',
  'TARGET_UNREACHABLE',
  'TIMEOUT',
  'RATE_LIMITED',
  'INTERNAL',
  'READ_LIMIT',
])

export const initPayloadSchema = z.object({
  target: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    username: z.string().min(1),
  }),
  authMethod: z.enum(['password', 'publickey', 'keyboard-interactive']),
  hostKey: z.object({
    mode: z.enum(['first-use', 'pinned']),
    fingerprint: z.string().min(1).optional(),
    algorithm: z.string().min(1).optional(),
  }),
  pty: z.object({
    term: z.string().min(1),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
  client: z
    .object({
      version: z.string().min(1),
    })
    .optional(),
})

export const authPayloadSchema = z.object({
  password: z.string().min(1).optional(),
  publickey: z
    .object({
      key: z.string().min(1),
      passphrase: z.string().min(1).optional(),
    })
    .optional(),
  kbdInteractive: z
    .object({
      challengeId: z.string().min(1),
      responses: z.array(z.string()),
    })
    .optional(),
})

export const connectPayloadSchema = z.object({
  command: z.string().min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
})

export const connectedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  serverId: z.string().min(1),
  hostKey: z.object({
    algorithm: z.string().min(1),
    fingerprint: z.string().min(1),
  }),
})

export const dataPayloadSchema = z.object({
  data: byteArraySchema,
})

export const stderrPayloadSchema = z.object({
  data: byteArraySchema,
})

export const resizePayloadSchema = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  pixelWidth: z.number().int().positive().optional(),
  pixelHeight: z.number().int().positive().optional(),
})

export const pingPayloadSchema = z.object({
  timestamp: z.number(),
})

export const pongPayloadSchema = z.object({
  timestamp: z.number(),
  serverTime: z.number(),
})

export const keepalivePayloadSchema = z.object({})

// kbdInteractiveChallengeSchema carries the structured prompts for a
// keyboard-interactive challenge (name/instructions plus per-prompt echo
// flags), matching golang.org/x/crypto/ssh's KeyboardInteractiveChallenge
// callback shape. Optional and additive to statusPayloadSchema so existing
// STATUS consumers are unaffected; without it a kbd-interactive challenge
// would be reduced to an unstructured message string and the frontend
// couldn't render multiple prompts or respect individual echo flags.
export const kbdInteractiveChallengeSchema = z.object({
  name: z.string().optional(),
  instructions: z.string().optional(),
  prompts: z.array(
    z.object({
      text: z.string().min(1),
      echo: z.boolean(),
    }),
  ),
})

export const statusPayloadSchema = z.object({
  state: connectionStateSchema,
  message: z.string().min(1).optional(),
  challenge: kbdInteractiveChallengeSchema.optional(),
})

export const errorPayloadSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
})

export const disconnectPayloadSchema = z.object({
  reason: z.enum(['client_close', 'server_shutdown', 'idle_timeout', 'error']).optional(),
})

export const envelopeBaseSchema = z.object({
  v: z.literal(protocolVersion),
  id: z.string().min(1).optional(),
})

function createEnvelopeSchema<Type extends MessageType, PayloadSchema extends z.ZodTypeAny>(
  type: Type,
  payload: PayloadSchema,
) {
  return envelopeBaseSchema.extend({
    type: z.literal(type),
    payload,
  })
}

export const initMessageSchema = createEnvelopeSchema('INIT', initPayloadSchema)
export const authMessageSchema = createEnvelopeSchema('AUTH', authPayloadSchema)
export const connectMessageSchema = createEnvelopeSchema('CONNECT', connectPayloadSchema)
export const connectedMessageSchema = createEnvelopeSchema('CONNECTED', connectedPayloadSchema)
export const dataMessageSchema = createEnvelopeSchema('DATA', dataPayloadSchema)
export const stderrMessageSchema = createEnvelopeSchema('STDERR', stderrPayloadSchema)
export const resizeMessageSchema = createEnvelopeSchema('RESIZE', resizePayloadSchema)
export const pingMessageSchema = createEnvelopeSchema('PING', pingPayloadSchema)
export const pongMessageSchema = createEnvelopeSchema('PONG', pongPayloadSchema)
export const keepaliveMessageSchema = createEnvelopeSchema('KEEPALIVE', keepalivePayloadSchema)
export const statusMessageSchema = createEnvelopeSchema('STATUS', statusPayloadSchema)
export const errorMessageSchema = createEnvelopeSchema('ERROR', errorPayloadSchema)
export const disconnectMessageSchema = createEnvelopeSchema('DISCONNECT', disconnectPayloadSchema)

export const messageSchemas = {
  INIT: initMessageSchema,
  AUTH: authMessageSchema,
  CONNECT: connectMessageSchema,
  CONNECTED: connectedMessageSchema,
  DATA: dataMessageSchema,
  STDERR: stderrMessageSchema,
  RESIZE: resizeMessageSchema,
  PING: pingMessageSchema,
  PONG: pongMessageSchema,
  KEEPALIVE: keepaliveMessageSchema,
  STATUS: statusMessageSchema,
  ERROR: errorMessageSchema,
  DISCONNECT: disconnectMessageSchema,
} as const

export const messageUnionSchema = z.discriminatedUnion('type', [
  initMessageSchema,
  authMessageSchema,
  connectMessageSchema,
  connectedMessageSchema,
  dataMessageSchema,
  stderrMessageSchema,
  resizeMessageSchema,
  pingMessageSchema,
  pongMessageSchema,
  keepaliveMessageSchema,
  statusMessageSchema,
  errorMessageSchema,
  disconnectMessageSchema,
])

export type InitPayload = z.infer<typeof initPayloadSchema>
export type AuthPayload = z.infer<typeof authPayloadSchema>
export type ConnectPayload = z.infer<typeof connectPayloadSchema>
export type ConnectedPayload = z.infer<typeof connectedPayloadSchema>
export type DataPayload = z.infer<typeof dataPayloadSchema>
export type StderrPayload = z.infer<typeof stderrPayloadSchema>
export type ResizePayload = z.infer<typeof resizePayloadSchema>
export type PingPayload = z.infer<typeof pingPayloadSchema>
export type PongPayload = z.infer<typeof pongPayloadSchema>
export type KeepalivePayload = z.infer<typeof keepalivePayloadSchema>
export type KbdInteractiveChallenge = z.infer<typeof kbdInteractiveChallengeSchema>
export type StatusPayload = z.infer<typeof statusPayloadSchema>
export type ErrorPayload = z.infer<typeof errorPayloadSchema>
export type DisconnectPayload = z.infer<typeof disconnectPayloadSchema>
export type BuddySshMessage = z.infer<typeof messageUnionSchema>
