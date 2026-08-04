import { describe, expect, it } from 'vitest'
import { sanitizeTerminalOutput } from './sanitize'

describe('sanitizeTerminalOutput', () => {
  it('blocks OSC 52 clipboard writes by default', () => {
    const osc52 = '\u001b]52;c;Y29weS10aGlz\u0007'
    expect(sanitizeTerminalOutput(`before${osc52}after`)).toBe('beforeafter')
  })

  it('allows OSC 52 clipboard writes when opted in', () => {
    const osc52 = '\u001b]52;c;Y29weS10aGlz\u0007'
    expect(sanitizeTerminalOutput(osc52, { allowOsc52: true })).toBe(osc52)
  })

  it('truncates title sequences', () => {
    const input = `\u001b]0;${'x'.repeat(10)}\u0007`
    expect(sanitizeTerminalOutput(input, { maxTitleLength: 4 })).toBe('\u001b]0;xxxx\u0007')
  })
})
