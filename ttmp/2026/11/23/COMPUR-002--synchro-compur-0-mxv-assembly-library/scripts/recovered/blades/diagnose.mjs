import {register} from 'node:module'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
const root=process.cwd()+'/import/jigcad/'
register(pathToFileURL(root+'test/engine/loader.mjs'))
const w=await import(pathToFileURL(root+'src/engine/worker.js'))
await w.handle({id:0,op:'init'})
const read=f=>readFileSync(root+'content/presets/CP-02-shutter-blades/'+f,'utf8')
for(const [stroke,drop] of [[0,'post2'],[0,'stop3'],[0,'stopLug'],[0,'drivePin'],[0,'post'],[3.7,'1.06'],[7.4,'post2'],[7.4,'stop3']]) {
 let lib=read('compur.parts.js')
 if(stroke===3.7) lib=lib.replaceAll('slotW: 0.96','slotW: '+drop)
 else lib=lib.split('\n').filter(l=>!l.includes("id: '"+drop)).join('\n')
 const files={'compur.parts.js':lib,'script.js':read('script.js').replace('const stroke = 0','const stroke = '+stroke).replace('return pack.params(angles)', "return pack.params(angles).interference("+ (stroke===3.7?"['blade1','ring']":"['base','ring']") +")")}
 const r=await w.handle({id:1,op:'compile',files,entry:'script.js',options:{}})
 console.log(stroke,drop,r.program?.diagnostics?.filter(x=>x.level==='error').map(x=>x.message),r.error)
}
