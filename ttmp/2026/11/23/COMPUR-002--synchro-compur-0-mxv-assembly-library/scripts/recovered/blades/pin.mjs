import {register} from 'node:module'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
const root=process.cwd()+'/import/jigcad/'
register(pathToFileURL(root+'test/engine/loader.mjs'))
const w=await import(pathToFileURL(root+'src/engine/worker.js'))
await w.handle({id:0,op:'init'})
const read=f=>readFileSync(root+'content/presets/CP-02-shutter-blades/'+f,'utf8')
for(const [stroke,drop] of [[3.7,'drivePin1'],[3.7,'drivePin2'],[3.7,'drivePin3'],[3.7,'drivePin4'],[3.7,'drivePin5'],[3.7,'drivePin']]) {
 let lib=read('compur.parts.js')
 lib=lib.split('\n').filter(l=>!l.includes("id: '"+drop)).join('\n')
 const files={'compur.parts.js':lib,'script.js':read('script.js').replace('const stroke = 0','const stroke = '+stroke).replace('return pack.params(angles)', "return pack.params(angles).interference("+ (stroke===3.7?"['blade1','ring']":"['base','ring']") +")")}
 const r=await w.handle({id:1,op:'compile',files,entry:'script.js',options:{}})
 console.log(stroke,drop,r.program?.diagnostics?.filter(x=>x.level==='error').map(x=>x.message),r.error)
}
