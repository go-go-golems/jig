// Usage: node <this file> BASE_URL [PLAYWRIGHT_MODULE]
// A 128×96 fixture with two 20-pixel-wide boxes at different optical depths.
const assert = require('node:assert/strict')
const { chromium } = require(process.argv[3] || 'playwright')
async function run() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/registration-check.html', r => r.fulfill({ contentType:'text/html', body:'<!doctype html><canvas></canvas>' }))
    await page.goto(new URL('/registration-check.html', process.argv[2]).href)
    const measured = await page.evaluate(async () => {
      const C = await import('/candela.js')
      const src = `import { scene, shape, light } from 'candela';
        export default scene().add(shape.box(0.2).at(-0.30, 0.16, -0.20))
          .add(shape.box(0.2).at(0.30,-0.12, 0.60)).add(light.env.uniform(1));`
      const result = await C.build({'scene.js':src})
      if (!result.ok) throw Error(result.error.message)
      const vp = new C.Viewport(document.querySelector('canvas'))
      try {
        await vp.init()
        await vp.load(result.compiled)
        vp.fixedSize = [128,96]
        vp.setView({at:[0,0,2],target:[0,0,0],orthographic:{right:[1,0,0],up:[0,1,0],height:0.96}})
        vp.frame({force:true})
        const ids = await vp.idPass(), boxes = new Map()
        for (let y=0;y<96;y++) for (let x=0;x<128;x++) {
          const id = Math.round(ids.data[(y*128+x)*4])
          if (id < 0) continue
          const b = boxes.get(id) || [128,96,0,0]
          b[0]=Math.min(b[0],x); b[1]=Math.min(b[1],y)
          b[2]=Math.max(b[2],x); b[3]=Math.max(b[3],y)
          boxes.set(id,b)
        }
        return { backend:vp.backendName, boxes:[...boxes.values()].sort((a,b)=>a[0]-b[0]) }
      } finally { vp.backend?.dispose() }
    })
    assert.deepEqual(measured.boxes,[[24,22,43,41],[84,50,103,69]])
    console.log(measured)
  } finally { await browser.close() }
}
run().catch(e=>{ console.error(e); process.exitCode=1 })
