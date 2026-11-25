// Verify fitted hardware in exact OpenCascade solids. Run at repository root.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { register } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const root = file => pathToFileURL(resolve('import/jigcad', file))
register(root('test/engine/loader.mjs'))
const W = await import(root('src/engine/worker.js'))
const K = await import(root('src/engine/kernel.js'))
await W.init()
async function compile(slug, fit) {
  const preset = 'content/presets/' + slug + '/'
  const files = Object.fromEntries(readdirSync(root(preset)).filter(f => f.endsWith('.js'))
    .map(file => [file, readFileSync(root(preset + file), 'utf8')]))
  if (fit) files['script.js'] = files['script.js'].replace(/const spread = \d+/, 'const spread = 0')
  const { program } = await W.handle({ op: 'compile', files })
  assert.ok(program.ok, JSON.stringify(program.diagnostics))
  return W.currentProgram().P.comp
}
const hardware = await compile('SG-04-needle-hardware', true)
const local = (assembly, id) => assembly.get(id).res.state.bodies[0].shape
function verifyPairs(assembly, pairs) {
  for (const [a, b] of pairs) {
    const A = K.transformShape(local(assembly, a), assembly.get(a).T)
    const B = K.transformShape(local(assembly, b), assembly.get(b).T)
    try {
      const overlap = K.commonVolume(A, B)
      assert.ok(overlap < 1e-5, a + ' / ' + b + ' overlap: ' + overlap)
    } finally { A.delete(); B.delete() }
  }
}
verifyPairs(hardware, [['bar','needle'], ['bar','clamp'], ['bar','clampScrew'],
  ['clamp','clampScrew'], ['clamp','needle'], ['needle','clampScrew'], ['bar','driveBracket']])
const needle = local(hardware, 'needle')
const eye = K.pointDistance(needle, [0, 0, -12.65])
assert.ok(Math.abs(eye - 0.15) < 1e-4, 'eye radial clearance ' + eye)
for (const y of [-0.6, 0.6])
  assert.ok(K.pointDistance(needle, [0, y, -12.65]) > 0.14, 'eye traversal')
assert.ok(K.pointDistance(needle, [0.3, 0, -12.65]) < 1e-6, 'eye sidewall')
assert.ok(K.pointDistance(needle, [0, 0.9, 10]) > 0.16, 'rear shank flat')
assert.ok(K.pointDistance(needle, [0, -0.9, 10]) < 1e-6, 'round shank front')
const support = await compile('SG-05-swing-support', true)
verifyPairs(support, [['gate','bar'], ['gate','gatePin'], ['gate','driveBracket']])
console.log('SG04/05: ten fitted component pairs have < 1e-5 mm³ common volume.')
console.log('Needle eye clear radius at center:', eye, 'mm; rear flat and eye sidewalls verified.')
const coupled = await compile('SG-03-upper-head', false)
const cycle = await W.call('studyTrack', [{ name: 'Stitch cycle' }])
for (let phase = 0; phase <= 720; phase += 30) {
  const sample = Array.from(cycle.x).findIndex(x => Math.abs(x - phase) < 1e-7)
  assert.ok(sample >= 0, 'missing phase ' + phase)
  const placed = new Map()
  for (const id of ['gate','bar','driveBracket','clamp','gatePin']) {
    const T = cycle.T[id].slice(sample * 16, sample * 16 + 16)
    placed.set(id, { res: coupled.get(id).res, T })
  }
  try {
    verifyPairs(placed, [['gate','bar'], ['gate','driveBracket'],
      ['gate','clamp'], ['gate','gatePin']])
  } catch (error) { throw Error('at ' + phase + ' degrees: ' + error.message) }
}
console.log('100 moving-pair checks passed at 25 shaft angles.')
