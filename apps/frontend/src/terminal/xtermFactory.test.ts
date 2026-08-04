// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { ControlledClipboardProvider, createXterm } from './xtermFactory'

describe('createXterm', () => {
  it('returns a terminal bundle with addons and OSC 52 disabled', () => {
    const bundle = createXterm({
      fontFamily: 'IBM Plex Mono',
      fontSize: 14,
      scrollback: 5000,
    })

    expect(bundle.terminal).toBeDefined()
    expect(bundle.addons.fit).toBeDefined()
    expect(bundle.addons.search).toBeDefined()
    expect(bundle.addons.webLinks).toBeDefined()
    expect(bundle.addons.serialize).toBeDefined()
    expect(bundle.addons.clipboard).toBeDefined()
    expect(bundle.addons.webgl).toBeDefined()
    expect(bundle.clipboard).toBeInstanceOf(ControlledClipboardProvider)
    expect(bundle.clipboard.osc52Enabled).toBe(false)
  })
})
