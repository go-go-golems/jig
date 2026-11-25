// Compile real bodies so this exercises repeated B-rep face vertices as well as
// watertight holes, retained appearance IDs, branch transforms and the cap normals.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = path => pathToFileURL(resolve('import/jigcad', path))
register(root('test/engine/loader.mjs'))
const { handle } = await import(root('src/engine/worker.js'))
const { shotGeometry } = await import(root('src/stage/section.js'))
const { meshVolume } = await import(root('src/stage/scene.js'))
const { V } = await import(root('src/stage/math.js'))
async function compile(files) {
  const {program} = await handle({op:'compile', files})
  assert.ok(program.ok, JSON.stringify(program.diagnostics))
  return program
}
const ring = await compile({'script.js':"return j.part('Sleeve').extrude(j.region.circle(10).subtract(j.region.circle(4)).on(j.plane.XY),mm(12))"})
const original = ring.bodies[0]
function cut(program, component, normal, offset) {
  return shotGeometry(program,{section:{components:[component],normal,offset}})
}
const display = cut(ring,original.part,[0,0,1],6)
const sleeve = display.bodies[0]
assert.equal(ring.bodies[0], original)
assert.equal(original.sectionCapFace, undefined)
assert.equal(sleeve.sectionCapFace,original.faces.length)
assert.equal(cut(ring,original.part,[0,0,1],20).bodies[0],original)
assert.equal(cut(ring,original.part,[0,0,1],-1).bodies.length,0)
const cap = sleeve.faces.at(-1)
const expected = Math.PI*(100-16)
assert.ok(Math.abs(cap.area - expected)/expected < 0.012)
assert.ok(Math.abs(meshVolume(sleeve.mesh)/meshVolume(original.mesh)-0.5)<1e-5)
const pt = (mesh, index) => Array.from(mesh.positions.slice(index*3,index*3+3))
const mesh = sleeve.mesh
let summedArea = 0
for (let t=0;t<mesh.triFace.length;t++) {
  if (mesh.triFace[t] !== cap.index) continue
  const [a,b,c] = Array.from(mesh.indices.slice(3*t,3*t+3),i => pt(mesh,i))
  assert.equal(a[2],6)
  const cross = V.cross(V.sub(b,a),V.sub(c,a))
  assert.ok(cross[2] > 0)
  summedArea += cross[2]/2
  // A hole containing the origin must never be covered by a cap triangle.
  const side = (p,q) => p[0]*q[1] - p[1]*q[0]
  assert.ok(side(a,b)<0 || side(b,c)<0 || side(c,a)<0)
}
assert.ok(Math.abs(summedArea-cap.area)<0.0001)
console.log('Bored sleeve: cap area',summedArea,'mm²; retained volume fraction',meshVolume(mesh)/meshVolume(original.mesh))
const dir = 'content/presets/SG-09-exploded-head/'
const files = Object.fromEntries(readdirSync(root(dir)).filter(f=>f.endsWith('.js')).map(f=>[f,readFileSync(root(dir+f),'utf8')]))
const head = await compile(files)
const section = {components:['presserGuide'],normal:[0,-1,0],offset:0}
const shot = {isolate:['presserGuide','presserBar'],section}
const result = shotGeometry(head,shot)
assert.deepEqual(result.bodies.map(b=>b.part).sort(),shot.isolate.slice().sort())
assert.ok(head.assembly.joints.length > result.assembly.joints.length)
assert.ok(result.assembly.ports.every(p => shot.isolate.includes(p.ref.split(':')[0])))
assert.ok(Object.keys(result.assembly.origins).every(id => shot.isolate.includes(id)))
const guide = result.bodies.find(b=>b.part==='presserGuide')
assert.ok(guide.faces.at(-1).area>1)
assert.equal(result.bodies.find(b=>b.part==='presserBar'),head.bodies.find(b=>b.part==='presserBar'))
assert.equal(shotGeometry({...head},shot).bodies,result.bodies)
assert.equal(guide.transform,head.bodies.find(b=>b.part==='presserGuide').transform)
console.log('SG-09: guide cut in local coordinates, bar intact; cap',guide.faces.at(-1).area,'mm²')
let tested = 0
for (const body of head.bodies) {
  const center = V.mul(V.add(...body.bbox),0.5)
  for (const normal of [[1,0,0],[0,1,0],[0,0,1],V.norm([1,2,3])]) {
    const offset = V.dot(center,normal)
    let out
    try { out = cut(head,body.part,normal,offset) }
    catch (error) { throw Error(body.part+' plane '+normal+': '+error.message) }
    const part = out.bodies.find(b => b.id === body.id)
    assert.ok(part && part.mesh.indices.length, body.id)
    tested++
  }
}
console.log('Completed',tested,'axis-aligned and oblique SG-09 section tests.')
