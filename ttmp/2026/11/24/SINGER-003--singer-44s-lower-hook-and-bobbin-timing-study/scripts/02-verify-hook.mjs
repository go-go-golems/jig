// Run from the Jig repository root. Read placed geometry from the actual worker.
import assert from 'node:assert/strict'
import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {register} from 'node:module'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const root = path => pathToFileURL(resolve('import/jigcad',path))
register(root('test/engine/loader.mjs'))
const W = await import(root('src/engine/worker.js'))
const K = await import(root('src/engine/kernel.js'))
const dir = root('content/presets/SG-10-hook-pass').href + '/'
const files = Object.fromEntries(readdirSync(new URL(dir)).filter(f=>f.endsWith('.js'))
  .map(f=>[f,readFileSync(new URL(f,dir),'utf8')]))
const {program,error} = await W.handle({op:'compile',files})
assert.ok(program?.ok,JSON.stringify(error||program?.diagnostics))
assert.equal(program.summary.bodies,5)
const comp = W.currentProgram().P.comp
const track = await W.call('studyTrack',[{name:'Hook pass'}])
assert.deepEqual(Array.from(track.rows),Array.from({length:121},(_,i)=>i))
const row = 60
const transform = (id,i)=>track.T[id].subarray(16*i,16*(i+1))
function frame(id,name) {
  const port=comp.get(id).c.item.meta.ports.find(p=>p.name===name)
  assert.ok(port, id+':'+name)
  return port.frame
}
function point(id,name,i=row) {
  const v=frame(id,name).origin.toArray(), t=transform(id,i)
  return [0,1,2].map(k=>v[0]*t[k]+v[1]*t[k+4]+v[2]*t[k+8]+t[k+12])
}
const close=(actual,expected,tol=1e-6)=>assert.ok(Math.abs(actual-expected)<=tol,
  'actual '+actual+', expected '+expected+' ± '+tol)
const hook=point('holder','point'), scarf=point('needle','scarfMid')
const eye=point('needle','eyeTop'), rest=frame('plate','needleLine').origin.toArray()
const needle=point('needle','slideAxis')
const rise=Math.hypot(...needle.map((n,k)=>n-rest[k]))
const gap=hook[1]-scarf[1]
close(rise,3.5)
close(gap,0.075)
close(hook[0],scarf[0])
close(hook[2],scarf[2])
assert.ok(point('holder','point',row-1)[0] > point('needle','scarfMid',row-1)[0])
assert.ok(point('holder','point',row+1)[0] < point('needle','scarfMid',row+1)[0])
const localShape=id=>comp.get(id).res.state.bodies[0].shape
const ids=[...comp.keys()]
const checked=new Set()
let maxCommonVolume=0, closestConflict=null
for(let i=0;i<=120;i++) {
  const shapes=ids.map(id=>K.transformShape(localShape(id),transform(id,i)))
  try {
    if (i===row) {
      close(K.pointDistance(shapes[ids.indexOf('holder')],hook),0)
      close(K.pointDistance(shapes[ids.indexOf('needle')],scarf),0)
      close(K.pointDistance(shapes[ids.indexOf('needle')],hook),gap)
    }
    const boxes=shapes.map(s=>K.bboxOf(s))
    for(let a=0;a<ids.length;a++) for(let b=0;b<a;b++) {
      if(boxes[a][0].some((x,k)=>x>=boxes[b][1][k] ||
          boxes[b][0][k]>=boxes[a][1][k])) continue
      const key=[ids[a],ids[b],...transform(ids[a],i),...transform(ids[b],i)].join(',')
      if(checked.has(key)) continue
      checked.add(key)
      const overlap=K.commonVolume(shapes[a],shapes[b])
      if (overlap>maxCommonVolume) {
        maxCommonVolume=overlap
        closestConflict={row:i,pair:[ids[a],ids[b]]}
      }
      assert.ok(overlap<0.001,`row ${i} ${ids[a]}/${ids[b]}: ${overlap} mm³`)
    }
  } finally {shapes.forEach(s=>s.delete())}
}
const receipt={preset:'SG-10-hook-pass',study:'Hook pass',row,lastRow:120,
  shaftDeg:track.x[row],timeSeconds:2,barRiseMm:rise,
  rearScarfGapMm:gap,pointAboveEyeTopMm:hook[2]-eye[2],
  hookPointWorldMm:hook,scarfSurfaceWorldMm:scarf,eyeTopWorldMm:eye,
  holderPointLocalMm:frame('holder','point').origin.toArray(),
  needleScarfLocalMm:frame('needle','scarfMid').origin.toArray(),
  commonVolumeSampleCount:track.rows.length,uniqueCandidateTests:checked.size,maxCommonVolumeMm3:maxCommonVolume,largestOverlap:closestConflict,
  provenance:{shaftDeg:'Computed from representative upper-head linkage and selected gate angle.',
    barRiseMm:'Specified by 3-11 and reconstructed along right-hand bar axis.',
    rearScarfGapMm:'Chosen midpoint of the separate 3-12 range; verified against the needle solid.',
    pointAboveEyeTopMm:'Estimated scarf-midpoint target, calculated from the reconstructed geometry.'}}
writeFileSync(new URL('../sources/hook-pass.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n')
console.log(JSON.stringify(receipt,null,2))
