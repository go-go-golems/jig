import {register} from 'node:module'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
const root=process.cwd()+'/import/jigcad/'
register(pathToFileURL(root+'test/engine/loader.mjs'))
const w=await import(pathToFileURL(root+'src/engine/worker.js'))
await w.handle({id:0,op:'init'})
for (const [d,module,settings,ret] of [
 ['CP-02-shutter-blades','compur.parts.js',[7.4],'return pack.params(angles)'],
 ['CP-08-diaphragm','diaphragm.parts.js',[0],'return iris']]){
const read=f=>readFileSync(root+'content/presets/'+d+'/'+f,'utf8')
for(const angle of settings){
 const files={[module]:read(module),'script.js':read('script.js').replace('const stroke = 0','const stroke = '+angle).replace(ret,ret+'.interference()')}
 const r=await w.handle({id:1,op:'compile',files,entry:'script.js',options:{}})
 console.log(d,angle,r.program?.bodies?.slice(0,4).map(b=>[b.id,b.transform]),r.program?.diagnostics?.filter(x=>x.level==="error"))
}}
