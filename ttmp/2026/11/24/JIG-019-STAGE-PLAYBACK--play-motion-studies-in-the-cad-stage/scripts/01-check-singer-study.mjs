// Run from the repository root. Compare one compiled track against independent
// placements archived before the Stage player was implemented.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const jig = p => pathToFileURL(resolve('import/jigcad', p))
register(jig('test/engine/loader.mjs'))
const worker = await import(jig('src/engine/worker.js'))
await worker.handle({ op: 'init' })
const preset = 'content/presets/SG-03-upper-head/'
const files = Object.fromEntries(['script.js', 'singer.parts.js'].map(f =>
  [f, execFileSync('git', ['show', 'ba235fe:import/jigcad/' + preset + f], { encoding: 'utf8' })]))
const { program } = await worker.handle({ op: 'compile', files, entry: 'script.js' })
assert.ok(program?.ok, JSON.stringify(program?.diagnostics))
const track = await worker.call('studyTrack', [{ name: 'Stitch cycle' }])
assert.equal(track.rows.length, 145)
assert.equal(Object.keys(track.T).length, 10)
const archive = new URL('../../SINGER-001--singer-44s-upper-stitch-head/sources/upper-head-cycle.tsv', import.meta.url)
const reference = readFileSync(archive, 'utf8').trim().split('\n').slice(1)
function point(id, sample, x, z) {
  const t = track.T[id].subarray(16 * sample)
  return [t[0]*x + t[8]*z + t[12], t[2]*x + t[10]*z + t[14]]
}
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))
let maxResidual = 0, maxReferenceError = 0
for (let i = 0; i < track.x.length; ++i) {
  maxResidual = Math.max(maxResidual,
    distance(point('crank', i, 0, -12), point('rod', i, 32, 0)),
    distance(point('lever', i, 22, 0), point('rocker', i, 20, 0)))
}
for (const row of reference) {
  const [phase, tx, tz, ex, ez] = row.split('\t').map(Number)
  const i = phase / 5
  assert.ok(Math.abs(track.x[i] - phase) < 1e-9)
  maxReferenceError = Math.max(maxReferenceError,
    distance(point('needle', i, 0, -17), [tx, tz]),
    distance(point('lever', i, -20, -9), [ex, ez]))
}
assert.ok(maxResidual < 1e-5)
assert.ok(maxReferenceError < 8e-5) // reference is rounded to four decimals
console.log('145 solved poses; maximum closure residual', maxResidual, 'mm')
console.log(reference.length, 'reference poses; maximum point error', maxReferenceError, 'mm')
