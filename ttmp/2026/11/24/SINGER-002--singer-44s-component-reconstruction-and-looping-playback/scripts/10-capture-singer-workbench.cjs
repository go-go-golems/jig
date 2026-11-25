// Run from the Jig repository root, after make web, with a serving workbench.
// node 10-capture-singer-workbench.cjs BASE_URL [PLAYWRIGHT_MODULE]
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.argv[3] || 'playwright')

const base = process.argv[2]
if (!base) throw Error('Expected BASE_URL')
const out = path.join(__dirname, '../sources/workbench')
const checked = execFileSync(process.execPath,
  ['import/jigcad/tools/preset-check.mjs', 'SG-', '--quiet'], {encoding: 'utf8'})
const presets = Array.from(checked.matchAll(/^ok\s+(SG-\d\d-\S+) · .*? · (\d+) features · (\d+) bodies/gm),
  ([,slug,features,bodies]) => ({slug, features: +features, bodies: +bodies, id: slug.slice(0,5)}))
  .filter(item => item.id <= 'SG-08') // Original reconstruction figure set.
assert.deepEqual(presets.map(p => p.id),
  ['SG-01','SG-02','SG-03','SG-04','SG-05','SG-06','SG-07','SG-08'])
const evidence = [['preset','features','bodies','view','file']]

async function fit(page, angle, components = null) {
  // Fit the camera to the chosen occurrence bounds projected onto the
  // current camera basis. The meshes remain in their solved positions.
  await page.getByRole('button', {name: angle === 'front' ? 'Front' : 'Axo', exact:true}).click()
  await page.evaluate(({components, angle}) => {
    const stage = document.querySelector('.sheethost').jigStage
    stage.setView({name:angle, yaw:0, pitch:0, zoom:1, scale:null,
      target:null, pan:[0,0], overlays:new Set()})
    stage.redraw()
    const {scene,cam} = stage._state()
    const selected = components ? components.map(id => {
      const inst = scene.instances.find(i => i.body.part === id)
      if (!inst) throw Error('Missing component '+id)
      return inst
    }) : scene.instances
    const corners = selected.flatMap(({box:[lo,hi]}) =>
      [lo[0],hi[0]].flatMap(x => [lo[1],hi[1]].flatMap(y => [lo[2],hi[2]].map(z => [x,y,z]))))
    const dot = (p,v) => p.reduce((sum,value,i) => sum+value*v[i],0)
    const extents = v => {
      const values = corners.map(p => dot(p,v))
      return [Math.min(...values), Math.max(...values)]
    }
    const [left,right] = extents(cam.r), [bottom,top] = extents(cam.u)
    const scale = Math.min(cam.W*0.75/(right-left), cam.H*0.76/(top-bottom))
    const depth = dot(cam.T,cam.c)
    const target = [0,1,2].map(i => (left+right)/2*cam.r[i] +
      (bottom+top)/2*cam.u[i] + depth*cam.c[i])
    stage.setView({name:angle, scale, target, pan:[0,0]})
    stage.redraw()
  }, {components, angle})
}

async function capture() {
  mkdirSync(out, {recursive: true})
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({viewport: {width: 1540, height: 1020}, deviceScaleFactor: 1})
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(base + '/?preset=' + presets[0].slug)
    await page.waitForFunction(() => window.jigHost?.program?.ok, null, {timeout: 90000})
    await page.getByRole('button', {name: /Layout/}).click()
    await page.getByRole('button', {name: /Everything in one tile/}).click()
    const canvas = page.locator('canvas[aria-label="drafting sheet"]')
    for (const item of presets) {
      await page.evaluate(id => jigHost.loadPreset(id), item.id)
      await page.waitForFunction(({id,features,bodies}) => {
        const summary = jigHost.program?.summary
        return !jigHost.compiling && jigHost.preset?.id === id &&
          summary?.features === features && summary?.bodies === bodies &&
          document.querySelector('.sheethost')?.jigStage?._state()?.scene.instances.length === bodies
      }, item, {timeout: 90000})
      const view = item.id === 'SG-03' ? 'axo' : await page.evaluate(() => jigHost.preset.view)
      await fit(page, view)
      await canvas.waitFor()
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({path: path.join(out, item.slug + '.png')})
      evidence.push([item.id, item.features, item.bodies, view, item.slug + '.png'])
      if (item.id === 'SG-04' || item.id === 'SG-07') {
        const components = item.id === 'SG-04' ? ['clamp', 'clampScrew'] : ['lever','eyeGuard','rocker']
        for (const angle of ['front','axo']) {
          await fit(page, angle, components)
          const file = item.id.toLowerCase() + '-' + angle + '-detail.png'
          await canvas.screenshot({path:path.join(out,file)})
          evidence.push([item.id,item.features,item.bodies,angle+' detail',file])
        }
      }
      console.log(item.id, item.features, 'features /', item.bodies, 'bodies')
    }
    assert.deepEqual(errors, [])
    writeFileSync(path.join(out,'index.tsv'), evidence.map(row => row.join('\t')).join('\n')+'\n')
  } finally { await browser.close() }
}
capture().catch(e => { console.error(e); process.exitCode=1 })
