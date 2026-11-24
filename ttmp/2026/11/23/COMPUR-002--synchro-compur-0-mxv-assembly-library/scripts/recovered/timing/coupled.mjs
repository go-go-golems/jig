import { register } from 'node:module'
import fs from 'node:fs'
import {pathToFileURL} from 'node:url'
const root=pathToFileURL(process.cwd()+'/')
register(new URL('./test/engine/loader.mjs', root))
const w = await import(new URL('./src/engine/worker.js',root))
await w.handle({id:0,op:'init'})
const dir='content/presets/CP-03-speed-escapement'
const files=Object.fromEntries(fs.readdirSync(dir).filter(x=>x.endsWith('.js')).map(x=>[x,fs.readFileSync(dir+'/'+x,'utf8')]))
files['script.js']=files['script.js'].replace('segmentAngle = 0','segmentAngle = .05')
files['script.js']=files['script.js'].split("  .drive('w1'")[0]+"  .couple('m1','segment','w1',{ratio:-15}).couple('m2','w1','w2',{ratio:-64/6}).couple('m3','w2','star',{ratio:-10})"; const {program:p}=await w.handle({id:1,op:'compile',files,entry:'script.js',options:{}})
console.log(p.assembly.joints.map(x=>[x.id,x.value]),p.diagnostics.filter(d=>!d.kind.startsWith('sketch')))
