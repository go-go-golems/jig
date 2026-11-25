// From repo root: node <script> BASE_URL [PLAYWRIGHT_MODULE]. Verifies the
// RGB colour pass itself against analytical positions in the real SG-09 guide.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const esbuild = require(path.resolve('.bin/esbuild/node_modules/esbuild'))
const {chromium} = require(process.argv[3] || 'playwright')

async function check() {
  const js = await esbuild.build({ stdin:{
    contents:`export {createStagePBR} from './import/jigcad/src/render/stage-pbr.js';
      export {shotGeometry} from './import/jigcad/src/stage/section.js';
      export {makeCam} from './import/jigcad/src/stage/camera.js';`, resolveDir:process.cwd()
  }, bundle:true,format:'esm',platform:'browser',write:false })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/section-test.mjs', r => r.fulfill({contentType:'text/javascript',body:js.outputFiles[0].text}))
    await page.goto(new URL('/?preset=SG-09-exploded-head',process.argv[2]).href)
    await page.waitForFunction(() => jigHost.program?.ok && !jigHost.compiling)
    const result = await page.evaluate(async () => {
      const {createStagePBR,shotGeometry,makeCam} = await import('/section-test.mjs')
      const files = new Map(jigHost.files)
      files.set('look.js', `import {scene,light,material} from 'candela';
        import {jigScene} from 'jig-candela';
        import {program} from 'jig-program';
        const asm=jigScene(program).material('presserBar',material.pbr().baseColor('#235bc0').roughness(0.7));
        export default scene().add(asm).add(light.env.uniform(1200));`)
      const program = jigHost.program
      const geometry = shotGeometry(program,{isolate:['presserGuide','presserBar'],
        section:{components:['presserGuide'], normal:[0,-1,0], offset:0}})
      const renderer = await createStagePBR({files, program,export:jigHost.export.bind(jigHost)})
      try {
        const camera=makeCam(0,0,7,[0,22,34],192,192)
        const body=geometry.bodies.find(b=>b.sectionCapFace!=null)
        if (!body) throw Error('Expected a cut guide')
        const pose=Object.fromEntries(geometry.bodies.map(b=>[b.part,Array.from(b.transform)]))
        const outputs=[]
        for(const dx of [0,42]) {
          if(dx) for(const T of Object.values(pose)) T[12]+=dx/7
          const frame = await renderer.render({camera,geometry,pose,width:192,height:192,spp:8})
          const ctx=frame.getContext('2d')
          const rgb=(x,y)=>Array.from(ctx.getImageData(x+dx,y,1,1).data.slice(0,3))
          // At z = 27 mm the cross-section cuts the annular sleeve in two
          // flat lands, flanking a continuous uncut rod at x = 0.
          outputs.push({cap:rgb(122,145),bar:rgb(96,145),background:rgb(52,145),png:frame.toDataURL().split(',')[1]})
        }
        return outputs
      } finally { renderer.dispose() }
    })
    const out=path.join(__dirname,'../sources')
    fs.mkdirSync(out,{recursive:true})
    for(const [i, image] of result.entries()) {
      const {cap,bar,background,png}=image
      console.log({i,cap,bar,background})
      fs.writeFileSync(path.join(out,'presser-guide-section-pbr-'+i+'.png'),Buffer.from(png,'base64'))
      assert.ok(cap[0]>cap[1] && cap[1]>cap[2],'orange cut face')
      assert.ok(bar[2]>bar[1] && bar[1]>bar[0],'blue bar from look.js')
      assert.ok(Math.max(...background)-Math.min(...background)<=2,'neutral background')
    }
  } finally { await browser.close() }
}
check().catch(e=>{console.error(e);process.exitCode=1})
