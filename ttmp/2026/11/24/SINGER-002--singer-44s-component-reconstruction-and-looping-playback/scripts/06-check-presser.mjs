// Run from the repository root. Compare the built meshes in both lift settings.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const local = p => pathToFileURL(resolve('import/jigcad', p))
register(local('test/engine/loader.mjs'))
const worker = await import(local('src/engine/worker.js'))
await worker.handle({ id: 0, op: 'init' })
const dir = 'content/presets/SG-06-presser-foot/'
const source = readFileSync(local(dir + 'presser.parts.js'), 'utf8')
function heights(body) {
  const m = body.transform
  const array = body.mesh.positions
  const zs = []
  for (let i = 0; i < array.length; i += 3) {
    zs.push(m[2]*array[i] + m[6]*array[i+1] + m[10]*array[i+2] + m[14])
  }
  return [Math.min(...zs), Math.max(...zs)]
}
// Cast vertical rays against upward sole triangles. The three slot locations
// cover the default stitched amplitude; the two neighboring rays verify tines.
function covered(body, x, y) {
  const { indices, positions } = body.mesh
  const orient = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const point = i => [positions[i*3], positions[i*3+1]]
  for (let i = 0; i < indices.length; i += 3) {
    const a = point(indices[i]), b = point(indices[i+1]), c = point(indices[i+2])
    if (orient(a,b,c) > 1e-8 && orient(a,b,[x,y]) >= -1e-8 &&
        orient(b,c,[x,y]) >= -1e-8 && orient(c,a,[x,y]) >= -1e-8) return true
  }
  return false
}
for (const lift of [0, 6.1]) {
  const files = { 'presser.parts.js': source, 'script.js':
    "const p = await importPartFile('presser.parts.js');" +
    "return p.mount(j.assembly('Presser test'), " + lift + ")" }
  const { program, error } = await worker.handle({ id: 1, op:'compile', files,
    entry:'script.js', options:{} })
  assert.ok(program?.ok, JSON.stringify(error || program?.diagnostics))
  const bodies = new Map(program.bodies.map(b => [b.part,b]))
  console.log(lift, 'mm:', [...bodies.keys()].join(', '))
  assert.equal(bodies.size, 11)
  assert.equal(program.bodies.length, 11)
  const foot = bodies.get('presserFoot')
  for (const x of [-2.65,0,2.65]) {
    for (const dx of [-0.5,0.5]) for (const y of [-0.45,0.45])
      assert.ok(!covered(foot,x+dx,y), 'Foot blocks needle at x=' + x)
  }
  for (const x of [-6,6]) assert.ok(covered(foot,x,0), 'Missing sole tine')
  const [sole] = heights(foot)
  const [bottom, top] = heights(bodies.get('presserSpring'))
  assert.ok(Math.abs(sole-lift)<1e-4, 'Foot height ' + sole)
  assert.ok(Math.abs(top-81) < 0.12, 'Spring upper seat ' + top)
  assert.ok(Math.abs(bottom-57-lift)<0.12, 'Spring lower seat ' + bottom)
  console.log('Foot sole',sole,'spring seat span',bottom,top)
}
