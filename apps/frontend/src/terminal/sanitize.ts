export interface SanitizeOptions {
  allowOsc52?: boolean
  maxTitleLength?: number
}

const defaultMaxTitleLength = 128
const escapeCharacter = String.fromCharCode(0x1b)
const bellCharacter = String.fromCharCode(0x07)
const osc52Pattern = new RegExp(
  `${escapeCharacter}]52;[^${bellCharacter}${escapeCharacter}]*(?:${bellCharacter}|${escapeCharacter}\\\\)`,
  'g',
)
const titlePattern = new RegExp(
  `${escapeCharacter}]([02]);([^${bellCharacter}${escapeCharacter}]*)(${bellCharacter}|${escapeCharacter}\\\\)`,
  'g',
)

// sanitizeTerminalOutput removes or clamps escape sequences that can cross the
// terminal boundary into browser or system integrations.
export function sanitizeTerminalOutput(output: string, options: SanitizeOptions = {}): string {
  const maxTitleLength = options.maxTitleLength ?? defaultMaxTitleLength
  let sanitized = output

  if (!options.allowOsc52) {
    sanitized = sanitized.replace(osc52Pattern, '')
  }

  return sanitized.replace(
    titlePattern,
    (_match, command: string, title: string, terminator: string) => {
      const truncatedTitle = title.slice(0, maxTitleLength)
      return `\u001b]${command};${truncatedTitle}${terminator}`
    },
  )
}
