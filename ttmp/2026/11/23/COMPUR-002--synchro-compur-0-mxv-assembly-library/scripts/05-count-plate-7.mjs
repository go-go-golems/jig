// Run from the Jig repository root. Inspect occurrence identities before meshing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const root = resolve('import/jigcad')
const { makeJ } = await import(pathToFileURL(resolve(root, 'src/engine/j.js')))
const { j, bare } = makeJ()
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const scope = { j, ...bare }

for (const folder of ['CP-02-shutter-blades', 'M-11-synchro-compur']) {
  const read = name => readFileSync(resolve(root, 'content/presets', folder, name), 'utf8')
  const importPartFile = async name => new AsyncFunction(...Object.keys(scope), read(name))(...Object.values(scope))
  const assembly = await new AsyncFunction(...Object.keys(scope), 'importPartFile', read('script.js'))(
    ...Object.values(scope), importPartFile)
  const occurrences = assembly.o.components
  const insetNumbers = ['225', '230', '268', '208', '267']
  const counts = insetNumbers.map(number => occurrences.filter(c =>
    c.item.name.split(/\s+/).includes(number)).length)
  console.log(folder + ' — ' + occurrences.length + ' occurrences')
  for (const [index, n] of insetNumbers.entries()) console.log(n, counts[index])
  assert.deepEqual(counts, [1, 0, 1, 3, 1])
  assert.deepEqual(occurrences.filter(c => /^blade[1-5]$/.test(c.id)).map(c => c.item.name),
    ['Blade 268 (1)', 'Blade 208 (2)', 'Blade 208 (3)', 'Blade 208 (4)', 'Blade 267 (5)'])
}
