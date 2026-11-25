// Verify the current three-dimensional placements using the compiled geometry.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const root = p=>pathToFileURL(resolve('import/jigcad',p))
register(root('test/engine/loader.mjs'))
const W = await import(root('src/engine/worker.js'))
async function compile(slug) {
  const dir = 'content/presets/'+slug+'/'
  const files = Object.fromEntries(readdirSync(root(dir)).filter(f=>f.endsWith('.js'))
    .map(f=>[f,readFileSync(root(dir+f),'utf8')]))
  const {program} = await W.handle({op:'compile',files})
  assert.ok(program?.ok, JSON.stringify(program?.diagnostics))
  return program
}
const point = (t,x,z)=>[t[0]*x+t[8]*z+t[12],t[2]*x+t[10]*z+t[14]]
const distance = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const head = await compile('SG-03-upper-head')
const cycle = await W.call('studyTrack',[{name:'Stitch cycle'}])
assert.equal(cycle.rows.length,145)
assert.equal(head.bodies.filter(b=>b.part==='bar').length,1)
const trace = []
let maxResidual=0
for (let i=0;i<cycle.x.length;i++) {
  const m=id=>cycle.T[id].subarray(i*16,i*16+16)
  maxResidual=Math.max(maxResidual,
    distance(point(m('rod'),32,0),point(m('crank'),0,-12)),
    distance(point(m('lever'),22,0),point(m('rocker'),20,0)))
  assert.ok(distance(point(m('presserFoot'),0,0),[0,0])<1e-6)
  trace.push([cycle.x[i],...point(m('needle'),0,-17),...point(m('lever'),44,-23.7)])
}
assert.ok(maxResidual<1e-5)
const study=await compile('SG-08-zigzag-timing')
const tip=point(study.bodies.find(b=>b.part==='needle').transform,0,-17)
assert.ok(tip[0]<0 && Math.abs(tip[1]-5)<1e-5)
writeFileSync(new URL('../sources/reconstructed-trajectory.tsv',import.meta.url),
  'shaft_deg\tneedle_x_mm\tneedle_z_mm\teye_x_mm\teye_z_mm\n'+trace.map(r=>r.map(v=>v.toFixed(5)).join('\t')).join('\n')+'\n')
console.log('SG-03 bodies:',head.bodies.length,'max planar closure residual (mm):',maxResidual,'SG-08 setup tip [X,Z]:',tip)
