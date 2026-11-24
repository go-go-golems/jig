// From the repository root, run this file with Node 24 after make web.
// Reads the shipped project file map, including the resolved library source.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve('import/jigcad')
const { handle } = await import(pathToFileURL(resolve(root, 'src/engine/worker.js')))
const catalog = JSON.parse(readFileSync(resolve(root, 'src/generated/content.json'), 'utf8'))
const id = process.argv[2] ?? 'M-11'
const preset = catalog.presets.find(p => p.id === id)
if (!preset) throw new Error('Unknown preset ' + id)
const reply = await handle({ id: 1, op: 'compile', files: preset.files, options: { interference: true } })
if (!reply.ok) throw new Error(reply.error.message)
const p = reply.program
const pass = p.trace.find(t => t.pass === 'interference')
if (!pass) throw new Error('Clearance pass missing')
console.log(id, pass.note)
const contacts = p.diagnostics.filter(d => d.kind === 'asm.interference')
console.log(contacts.length + ' component pairs touch or overlap at the home pose')
for (const d of contacts) console.log(d.at)
const errors = p.diagnostics.filter(d => d.level === 'error' && d.kind !== 'asm.interference')
if (errors.length) throw new Error(errors.map(d => d.message).join('\n'))
