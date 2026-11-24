import {register} from 'node:module'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
const root=process.cwd()+'/import/jigcad/'
register(pathToFileURL(root+'test/engine/loader.mjs'))
const w=await import(pathToFileURL(root+'src/engine/worker.js'))
await w.handle({id:0,op:'init'})
const name='compur.parts.js'
const source=readFileSync(root+'content/presets/M-11-synchro-compur/'+name,'utf8')
const ids=['housing','tube','iris','cover','bladePlate','base','blade1','blade2','blade3','blade4','blade5','ring','carrier','pallet','escPlates']
const files={[name]:source,'script.js':[
  "const parts = await importPartFile('compur.parts.js')",
  "let asm = j.assembly('stack')",
  ...ids.map((id,i)=>"asm = asm.add('"+id+"',parts."+id+"(),"+(i===0?"{ground:true}":"{at:j.tx.move(0,0,0)}")+")"),
  "return asm.interference()"].join('\n')}
const r=await w.handle({id:1,op:'compile',files,entry:'script.js'})
console.log(r.program?.diagnostics?.filter(x=>x.kind==='asm.interference').map(x=>x.at),r.error)
