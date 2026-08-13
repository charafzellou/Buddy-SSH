import { describe, expect, it } from 'vitest'
import { zeroize } from './zeroize'

describe('zeroize', () => {
  it('fills the buffer with zeros in place', () => {
    const buffer = new Uint8Array([1, 2, 3, 255, 128])

    zeroize(buffer)

    expect(buffer).toEqual(new Uint8Array([0, 0, 0, 0, 0]))
  })

  it('is a no-op on an empty buffer', () => {
    const buffer = new Uint8Array(0)

    expect(() => zeroize(buffer)).not.toThrow()
    expect(buffer).toEqual(new Uint8Array(0))
  })

  it('fills a raw ArrayBuffer with zeros in place', () => {
    const buffer = new Uint8Array([9, 8, 7]).buffer

    zeroize(buffer)

    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([0, 0, 0]))
  })
})
