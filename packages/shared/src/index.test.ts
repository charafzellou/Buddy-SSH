import { describe, expect, it } from 'vitest'

import { messageUnionSchema } from './index'

describe('messageUnionSchema', () => {
  it('parses a valid INIT message', () => {
    const parsed = messageUnionSchema.parse({
      v: 1,
      type: 'INIT',
      payload: {
        target: {
          host: 'example.com',
          port: 22,
          username: 'ops',
        },
        authMethod: 'password',
        hostKey: {
          mode: 'first-use',
        },
        pty: {
          term: 'xterm-256color',
          cols: 80,
          rows: 24,
        },
      },
    })

    expect(parsed.type).toBe('INIT')
    expect(parsed.payload.target.host).toBe('example.com')
  })
})
