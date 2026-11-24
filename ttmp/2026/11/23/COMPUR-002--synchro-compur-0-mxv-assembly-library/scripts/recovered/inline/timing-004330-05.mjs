import { register } from 'node:module'
import fs from 'node:fs'
register(new URL('./test/engine/loader.mjs', import.meta.url))
const w = await import('./src/engine/worker.js')
await w.handle({id:0,op:'init'})
for(const id of ['CP-03','CP-07']){
 const dir = 'content/presets/'+fs.readdirSync('content/presets').find(x=>x.startsWith(id))
 const files=Object.fromEntries(fs.readdirSync(dir).filter(x=>x.endsWith('.js')).map(x=>[x,fs.readFileSync(dir+'/'+x,'utf8')]))
 files['script.js']=files['script.js'].replace("drive('segment', deg(0))","drive('segment', deg(.05))")
 const {program:p}=await w.handle({id:1,op:'compile',files,entry:'script.js',options:{}})
 console.log(id,p.assembly.joints.map(x=>[x.id,x.value]),new Set(p.bodies.map(x=>x.part)).size)
}
