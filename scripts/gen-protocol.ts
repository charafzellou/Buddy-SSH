import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type JsonSchema = {
  $ref?: string
  type?: string
  const?: string | number | boolean
  enum?: Array<string | number | boolean>
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  anyOf?: JsonSchema[]
  minimum?: number
  maximum?: number
}

type GeneratedStruct = {
  name: string
  lines: string[]
}

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sharedSchemaPath = resolve(repoRoot, 'packages/shared/dist/schema.json')
const outputPath = resolve(repoRoot, 'apps/backend/internal/protocol/protocol_gen.go')

const generatedStructs = new Map<string, GeneratedStruct>()
const generationOrder: string[] = []

function toGoIdent(value: string): string {
  const withWordBreaks = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()

  const segments = withWordBreaks.split(/\s+/).filter(Boolean)
  const normalized = segments.map((segment) => {
    const lower = segment.toLowerCase()

    switch (lower) {
      case 'id':
        return 'ID'
      case 'pty':
        return 'PTY'
      case 'ssh':
        return 'SSH'
      case 'ws':
        return 'WS'
      default:
        return segment.charAt(0).toUpperCase() + segment.slice(1)
    }
  })

  const name = normalized.join('')
  return /^\d/.test(name) ? `Field${name}` : name
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
  if (!ref.startsWith('#/')) {
    throw new Error(`Unsupported schema reference: ${ref}`)
  }

  const segments = ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))

  let current: unknown = root
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      throw new Error(`Unresolvable schema reference: ${ref}`)
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current as JsonSchema
}

function isByteArraySchema(schema: JsonSchema): boolean {
  const itemSchema = schema.items
  return (
    schema.type === 'array' &&
    itemSchema?.type === 'integer' &&
    itemSchema.minimum === 0 &&
    itemSchema.maximum === 255
  )
}

function goTypeForSchema(
  root: JsonSchema,
  typeName: string,
  schema: JsonSchema,
  required: boolean,
): string {
  const resolved = schema.$ref ? resolveRef(root, schema.$ref) : schema

  if (resolved.anyOf?.length) {
    throw new Error(`Unsupported nested anyOf for ${typeName}`)
  }

  if (resolved.type === 'object') {
    if (resolved.properties && Object.keys(resolved.properties).length > 0) {
      ensureStruct(root, typeName, resolved)
      return required ? typeName : `*${typeName}`
    }

    if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
      const valueType = goTypeForSchema(
        root,
        `${typeName}Value`,
        resolved.additionalProperties,
        true,
      )
      return `map[string]${valueType}`
    }

    return required ? 'map[string]any' : 'map[string]any'
  }

  if (resolved.type === 'array') {
    if (isByteArraySchema(resolved)) {
      return '[]uint8'
    }

    const itemType = goTypeForSchema(root, `${typeName}Item`, resolved.items ?? {}, true)
    return `[]${itemType}`
  }

  if (resolved.type === 'integer') {
    return required ? 'int' : '*int'
  }

  if (resolved.type === 'number') {
    return required ? 'float64' : '*float64'
  }

  if (resolved.type === 'boolean') {
    return required ? 'bool' : '*bool'
  }

  return required ? 'string' : '*string'
}

function ensureStruct(root: JsonSchema, name: string, schema: JsonSchema): void {
  if (generatedStructs.has(name)) {
    return
  }

  const properties = schema.properties ?? {}
  const requiredFields = new Set(schema.required ?? [])
  const fieldNames = Object.keys(properties).sort((left, right) => left.localeCompare(right))
  const lines = [`type ${name} struct {`]

  for (const propertyName of fieldNames) {
    const propertySchema = properties[propertyName]
    const nestedName = `${name}${toGoIdent(propertyName)}`
    const required = requiredFields.has(propertyName)
    const fieldType = goTypeForSchema(root, nestedName, propertySchema, required)
    const fieldName = toGoIdent(propertyName)
    const tagSuffix = required ? propertyName : `${propertyName},omitempty`

    lines.push(`\t${fieldName} ${fieldType} \`json:"${tagSuffix}" msgpack:"${tagSuffix}"\``)
  }

  lines.push('}')
  generatedStructs.set(name, { name, lines })
  generationOrder.push(name)
}

function generateMessageStruct(root: JsonSchema, messageSchema: JsonSchema): void {
  const properties = messageSchema.properties ?? {}
  const typeConst = properties.type?.const

  if (typeof typeConst !== 'string') {
    throw new Error('Message schema missing string const type')
  }

  const messageName = toGoIdent(typeConst.toLowerCase())
  const payloadName = `${messageName}Payload`
  const payloadSchema = properties.payload

  if (!payloadSchema) {
    throw new Error(`Message ${typeConst} missing payload schema`)
  }

  ensureStruct(
    root,
    payloadName,
    payloadSchema.$ref ? resolveRef(root, payloadSchema.$ref) : payloadSchema,
  )

  const messageStructName = `${messageName}Message`
  const lines = [
    `type ${messageStructName} struct {`,
    '\tV int `json:"v" msgpack:"v"`',
    '\tID *string `json:"id,omitempty" msgpack:"id,omitempty"`',
    '\tType string `json:"type" msgpack:"type"`',
    `\tPayload ${payloadName} \`json:"payload" msgpack:"payload"\``,
    '}',
  ]

  generatedStructs.set(messageStructName, { name: messageStructName, lines })
  generationOrder.push(messageStructName)
}

const buildShared = Bun.spawnSync({
  cmd: ['bun', 'run', '--filter', '@buddy-ssh/shared', 'build'],
  cwd: repoRoot,
  stderr: 'inherit',
  stdout: 'inherit',
})

if (buildShared.exitCode !== 0) {
  process.exit(buildShared.exitCode)
}

const schema = JSON.parse(await readFile(sharedSchemaPath, 'utf8')) as JsonSchema
const unionSchema = schema.definitions?.BuddySshMessage as JsonSchema | undefined

if (!unionSchema?.anyOf?.length) {
  throw new Error('Shared schema is missing definitions.BuddySshMessage.anyOf')
}

for (const messageSchema of unionSchema.anyOf) {
  generateMessageStruct(schema, messageSchema)
}

const fileLines = [
  '// Code generated by scripts/gen-protocol.ts. DO NOT EDIT.',
  '',
  'package protocol',
  '',
]

for (const name of generationOrder) {
  const generated = generatedStructs.get(name)
  if (!generated) {
    continue
  }

  fileLines.push(...generated.lines, '')
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${fileLines.join('\n')}\n`, 'utf8')

const gofmt = Bun.spawnSync({
  cmd: ['gofmt', '-w', outputPath],
  cwd: repoRoot,
  stderr: 'inherit',
  stdout: 'inherit',
})

if (gofmt.exitCode !== 0) {
  process.exit(gofmt.exitCode)
}

console.log(`Generated ${outputPath}`)
