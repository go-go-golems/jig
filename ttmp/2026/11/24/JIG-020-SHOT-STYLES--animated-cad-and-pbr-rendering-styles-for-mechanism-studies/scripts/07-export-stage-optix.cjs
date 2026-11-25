// From repository root, node <script> WORKBENCH_URL JOB [PLAYWRIGHT_MODULE]
// [--only package|plates|all] [--rows 0,36,84] [--width 1920] [--height 1080].
// Explicitly requests full authored SG09 poses and estimated Studio materials.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const {parseArgs} = require('node:util')
const {values,positionals} = parseArgs({allowPositionals:true,options:{
  width:{type:'string',default:'1920'}, height:{type:'string',default:'1080'},
  only:{type:'string',default:'all'}, rows:{type:'string'},
}})
const [base,destination,playwright] = positionals
if (!base || !destination) throw Error('Expected WORKBENCH_URL JOB [PLAYWRIGHT_MODULE]')
const {chromium} = require(playwright || 'playwright')
const root = path.resolve('import/jigcad')
const esbuild = require(path.resolve('.bin/esbuild/node_modules/esbuild'))
const width = Number(values.width), height = Number(values.height)
assert.ok(Number.isInteger(width) && width >= 32 && Number.isInteger(height) && height >= 32)
assert.ok(['all','package','plates'].includes(values.only))
const rows = values.rows && new Set(values.rows.split(',').map(Number))
const pixels = digits => String(digits).padStart(4,'0')
const job = path.resolve(destination)
function atomic(file,data) {
  fs.writeFileSync(file+'.partial',data)
  fs.renameSync(file+'.partial',file)
}
async function run() {
  fs.mkdirSync(job,{recursive:true})
  const bundle = await esbuild.build({
    stdin:{contents:`export {shotAt} from './src/render/shot.js';
      export {sheetView,stagePackage} from './src/render/stage-pbr.js';
      export {toCandelaMatrix} from './src/render/frame.js';
      export {defaultLook} from './src/render/host.js';`,resolveDir:root},
    bundle:true,write:false,format:'iife',globalName:'shotExport',logLevel:'silent',
  })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({viewport:{width:1450,height:920}})
    page.on('pageerror',e=>console.error('Workbench:',e.message))
    await page.goto(new URL('/?preset=SG-09-exploded-head',base).href)
    await page.getByRole('button',{name:/Layout/}).click()
    await page.getByRole('button',{name:/Everything in one tile/}).click()
    await page.getByRole('checkbox',{name:'Loop'}).waitFor({timeout:90000})
    await page.getByRole('button',{name:'Axo',exact:true}).click()
    await page.getByRole('slider',{name:'Study sample'}).fill('84')
    await page.addScriptTag({content:bundle.outputFiles[0].text})
    // Capture the actual snapshot and timeline from this button. The helper
    // reads the same bounds, camera, theme, assembly and overlays as Save PNG.
    await page.evaluate(() => {
      const stage = document.querySelector('.sheethost').jigStage
      const original = stage.renderCamera
      stage.renderCamera = function(study) {
        const draw = original.call(this,study)
        window.nativeShot = {study,draw,canvas:document.createElement('canvas')}
        stage.renderCamera = original
        return draw
      }
    })
    await page.getByRole('button',{name:'Render…',exact:true}).click()
    await page.evaluate(async({width,height}) => {
      const n = nativeShot
      const s = n.study
      if (!s.cyclic || s.last !== 312 || s.seconds !== 13 || !s.complete) throw Error('Unexpected Singer timeline')
      await document.fonts.ready
      n.options = row => {
        const fraction = row/s.last
        return {row,width,height,fraction,zoom:1.7,fit:true,style:shotExport.shotAt(s.shot,fraction*s.seconds)}
      }
      n.black = document.createElement('canvas')
      n.white = document.createElement('canvas')
      for (const [c,color] of [[n.black,'black'],[n.white,'white']]) {
        c.width = c.height = 1
        const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0,0,1,1)
      }
    },{width,height})
    if (values.only !== 'plates') {
      const look = await page.evaluate(async()=>{
        nativeShot.pkg = JSON.parse((await jigHost.export('candela',{quality:'preview'})).data)
        return jigHost.files.get('look.js') ?? shotExport.defaultLook({ground:false})
      })
      const frames = [], variants = new Set()
      for (let row=0;row<312;row++) {
        const data = await page.evaluate(async({row,known})=>{
          const n = nativeShot, o = n.options(row)
          // Sweeps can produce a different clipped mesh at every sample.
          n.variants ??= new Map()
          const signature = JSON.stringify([o.style.isolate, o.style.section])
          if (!n.variants.has(signature)) {
            const name = !o.style.isolate && !o.style.section ? 'full'
              : o.style.section && !known.includes('section') ? 'section' : 'geometry-' + row
            n.variants.set(signature, name)
          }
          const variant = n.variants.get(signature)
          const surface = o.style.surface, time = row/24
          // Stop at the beauty callback. Positive surface requests camera and
          // geometry even on the CAD-only rows, without a GPU/drawing pass.
          const stop = Symbol()
          let entry, pkg
          try {
            await n.draw(n.canvas,{...o,style:{...o.style,surface:1}},({camera,pose,geometry})=>{
              const poses = Object.fromEntries(n.pkg.components.map(c=>[c.id,
                pose?.[c.id] ? shotExport.toCandelaMatrix(pose[c.id]) : c.transform]))
              entry = {row,time,surface,variant,view:shotExport.sheetView(camera,geometry.bodies,pose),poses}
              if (!known.includes(variant)) {
                const adapted = shotExport.stagePackage(n.pkg,geometry.bodies)
                // Rebuild the standalone module with the native bridge's
                // existing base64 typed-array format (section caps are typed).
                pkg = JSON.stringify(adapted,(key,v)=>{
                  if (!ArrayBuffer.isView(v)) return v
                  const bytes = new Uint8Array(v.buffer,v.byteOffset,v.byteLength)
                  let raw = ''
                  for(let i=0;i<bytes.length;i+=16384) raw += String.fromCharCode(...bytes.subarray(i,i+16384))
                  return btoa(raw)
                })
              }
              throw stop
            })
          } catch(e) { if(e!==stop) throw e }
          if (!entry) throw Error('Failed to capture beauty camera')
          return {entry,pkg}
        },{row,known:[...variants]})
        frames.push(data.entry)
        if (data.pkg) {
          const dir=path.join(job,data.entry.variant)
          fs.mkdirSync(dir,{recursive:true})
          atomic(path.join(dir,'scene.js'),look)
          atomic(path.join(dir,'jig-program.js'),'export const program = '+data.pkg+'\n')
          fs.copyFileSync(path.join(root,'src/render/jig-candela.js'),path.join(dir,'jig-candela.js'))
          variants.add(data.entry.variant)
        }
      }
      atomic(path.join(job,'frames.json'),JSON.stringify(frames)+'\n')
      console.log('Wrote',frames.length,'frames and',variants.size,'scene variants')
    }
    if (values.only === 'package') return
    const dir=path.join(job,'plates')
    fs.mkdirSync(dir,{recursive:true})
    for(let row=0;row<312;row++) {
      if (rows && !rows.has(row)) continue
      const result = await page.evaluate(async row=>{
        const n=nativeShot, o=n.options(row), out={}
        for (const key of o.style.surface ? ['black','white'] : ['black']) {
          await n.draw(n.canvas,o,async()=>n[key])
          out[key] = n.canvas.toDataURL('image/png').split(',')[1]
        }
        return out
      },row)
      for(const [key,bytes] of Object.entries(result))
        atomic(path.join(dir,key+'-'+pixels(row)+'.png'),Buffer.from(bytes,'base64'))
      if(row%24===0 || row===311) console.log('CAD plates',row)
    }
  } finally { await browser.close() }
}
run().catch(e=>{ console.error(e);process.exitCode=1 })
