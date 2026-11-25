// Sample complete SG-03. Broad-phase boxes eliminate disjoint pairs.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const root = p => pathToFileURL(resolve('import/jigcad', p))
register(root('test/engine/loader.mjs'))
const W = await import(root('src/engine/worker.js'))
const K = await import(root('src/engine/kernel.js'))
await W.init()
const dir = 'content/presets/SG-03-upper-head/'
const files = Object.fromEntries(readdirSync(root(dir)).filter(f=>f.endsWith('.js'))
  .map(f=>[f,readFileSync(root(dir+f),'utf8')]))
const {program} = await W.handle({op:'compile', files})
assert.ok(program.ok)
const parts = W.currentProgram().P.comp
const track = await W.call('studyTrack',[{name:'Stitch cycle'}])
assert.equal(track.rows.length,145)
const collisions = [], saved = new Map()
for(let i=0; i<145; i+=3) {
  const solids = [...parts].map(([id,part]) => {
    const T=track.T[id].slice(i*16,i*16+16)
    const body=K.transformShape(part.res.state.bodies[0].shape,T)
    return {id,body,T,box:K.bboxOf(body)}
  })
  try {
    for(let j=0;j<solids.length;j++) for(let k=j+1;k<solids.length;k++) {
      const a=solids[j], b=solids[k]
      if(a.box[0].some((v,d)=>v>=b.box[1][d]-0.0001 || b.box[0][d]>=a.box[1][d]-0.0001)) continue
      const key=a.id+' '+b.id+' '+[...a.T,...b.T].map(v=>v.toFixed(7)).join(',')
      if(!saved.has(key)) saved.set(key,K.commonVolume(a.body,b.body))
      const volume=saved.get(key)
      if(volume>0.001) collisions.push([track.x[i],a.id,b.id,volume.toFixed(4)])
    }
  } finally {solids.forEach(s=>s.body.delete())}
}
const output='shaft_deg\tcomponent_a\tcomponent_b\tcommon_volume_mm3\n'+collisions.map(r=>r.join('\t')+'\n').join('')
writeFileSync(new URL('../sources/assembly-fit.tsv',import.meta.url),output)
console.log(collisions.length+' positive intersections in 49 sampled poses; see assembly-fit.tsv')
assert.equal(collisions.length, 0, 'See assembly-fit.tsv for the colliding occurrences')
