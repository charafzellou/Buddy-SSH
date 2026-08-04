import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { zodToJsonSchema } from 'zod-to-json-schema'

import { messageUnionSchema } from '../src/index'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const entrypoint = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const schemaPath = fileURLToPath(new URL('../dist/schema.json', import.meta.url))

await mkdir(distDir, { recursive: true })

const buildResult = await Bun.build({
  entrypoints: [entrypoint],
  format: 'esm',
  minify: false,
  outdir: distDir,
  sourcemap: 'linked',
  target: 'browser',
})

if (!buildResult.success) {
  for (const log of buildResult.logs) {
    console.error(log)
  }

  process.exit(1)
}

const schema = zodToJsonSchema(messageUnionSchema, {
  name: 'BuddySshMessage',
  target: 'jsonSchema7',
})

await Bun.write(schemaPath, `${JSON.stringify(schema, null, 2)}\n`)
console.log(`Built shared package into ${distDir}`)
