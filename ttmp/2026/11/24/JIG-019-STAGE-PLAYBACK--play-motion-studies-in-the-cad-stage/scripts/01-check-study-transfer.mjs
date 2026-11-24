// Run at repository root. Exercise the actual worker transfer protocol twice.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const local = path => pathToFileURL(resolve('import/jigcad', path))
register(local('test/engine/loader.mjs'))
const { handle, transferables } = await import(local('src/engine/worker.js'))
const source = readFileSync(local('content/presets/F-06-slider-crank-mechanism/script.js'), 'utf8')
const compile = await handle({ op: 'compile', files: { 'script.js': source } })
assert.ok(compile.program?.ok, JSON.stringify(compile.error))
async function fetchTrack(name) {
  const reply = await handle({ op: 'call', method: 'studyTrack', args: [{ name }] })
  return structuredClone(reply, { transfer: transferables(reply) })
}
const { value } = await fetchTrack('cycle')
assert.equal(value.rows.length, 361)
assert.equal(value.x[90], 90)
assert.equal(value.x.at(-1), 360)
assert.ok(Object.values(value.T).every(m => m.length === 361 * 16))
assert.deepEqual((await fetchTrack('cycle')).value, value)
assert.match((await fetchTrack('missing')).error.message, /missing/)
console.log('361 native poses, retained buffers and missing-study diagnostic verified')
