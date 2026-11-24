// Run from the repository root. Check world placements after the Jig solve.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const local = p => pathToFileURL(resolve('import/jigcad', p))
register(local('test/engine/loader.mjs'))
const worker = await import(local('src/engine/worker.js'))
await worker.handle({ id: 0, op: 'init' })
const library = readFileSync(local('content/presets/SG-03-upper-head/singer.parts.js'), 'utf8')
const trace = []
for (let phase = 0; phase <= 720; phase += 10) {
  const files = { 'singer.parts.js': library, 'script.js':
    "const p = await importPartFile('singer.parts.js');" +
    "return p.assemble('upper head'," + phase + ",p.swingAt(" + phase + ",2))" }
  const { program } = await worker.handle({ id: phase + 1, op: 'compile',
    files, entry: 'script.js', options: {} })
  assert.ok(program?.ok)
  assert.equal(program.bodies.length, 10)
  function point(id, x, z) {
    const bodies = program.bodies.filter(b => b.id.startsWith(id + '/'))
    assert.equal(bodies.length, 1, id)
    const m = bodies[0].transform
    return [m[0]*x + m[8]*z + m[12], m[2]*x + m[10]*z + m[14]]
  }
  function coincident(a, b) {
    assert.ok(Math.hypot(a[0]-b[0], a[1]-b[1]) < 1e-5,
      'joint closure at ' + phase + ' degrees: ' + a + ' vs ' + b)
  }
  coincident(point('crank', 0, -12), point('rod', 32, 0))
  coincident(point('lever', 22, 0), point('rocker', 20, 0))
  const tip = point('needle', 0, -17), eye = point('lever', -20, -9)
  if (tip[1] <= 0) assert.ok(Math.abs(tip[0]) < 4)
  trace.push({ phase, tip, eye })
}
const last = trace.at(-1)
for (const key of ['tip', 'eye']) {
  assert.ok(Math.hypot(...last[key].map((v,i) => v-trace[0][key][i])) < 1e-5)
}
assert.ok(trace[0].tip[0] * trace[36].tip[0] < 0)
assert.ok(trace[18].eye[1] > trace[0].eye[1], 'eye rises by needle top center')
const rows = trace.map(({phase, tip, eye}) =>
  [phase, ...tip, ...eye].map(v => v.toFixed(4)).join('\t'))
writeFileSync(new URL('../sources/upper-head-cycle.tsv', import.meta.url),
  'shaft_deg\tneedle_x_mm\tneedle_z_mm\teye_x_mm\teye_z_mm\n' + rows.join('\n') + '\n')
console.log('73 poses, both closures, alternating penetrations and periodic return passed')
