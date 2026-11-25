// Run with BASE_URL and optionally an absolute Playwright module path.
const assert = require('node:assert/strict')
const path = require('node:path')
const {chromium} = require(process.argv[3] || 'playwright')
async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({viewport: {width:1540, height:1020}})
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(process.argv[2] + '/?preset=SG-09-exploded-head')
    await page.getByRole('button', {name:/Layout/}).click()
    await page.getByRole('button', {name:/Everything in one tile/}).click()
    const loop = page.getByRole('checkbox', {name:'Loop'})
    await loop.waitFor({timeout:90000})
    assert.equal(await loop.isChecked(), true)
    const range = page.getByRole('slider', {name:'Study sample'})
    const capture = name => page.screenshot({path:path.join(__dirname,'../sources/workbench/SG-09-'+name+'.png')})
    const pose = async row => {
      await range.fill(String(row))
      return page.evaluate(async () => {
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
        const scene = document.querySelector('.sheethost').jigStage._state().scene
        return Object.fromEntries(scene.instances.map(i => [i.body.part, Array.from(i.M)]))
      })
    }
    const home = await pose(0)
    const offsets = await page.evaluate(() => jigHost.preset.presentation.offsets)
    assert.deepEqual(Object.keys(home).sort(), [...Object.keys(offsets),'head'].sort())
    assert.equal(Object.keys(home).filter(id => id.startsWith('presser')).length,11)
    const spread = await pose(84)
    await capture('full-spread')
    await page.getByRole('button', {name:'Axo',exact:true}).click()
    await pose(85)
    await capture('full-spread-axo')
    await page.getByRole('button', {name:'Front',exact:true}).click()
    function near(a,b) { assert.ok(Math.abs(a-b)<1e-5, a+' differs from '+b) }
    for (const id of Object.keys(home)) {
      for (let k=0; k<16; k++) near(spread[id][k],home[id][k]+(offsets[id]?.[k-12] || 0))
    }
    const assembled = await pose(168)
    await capture('assembled')
    const operating = await pose(204)
    await capture('sewing')
    assert.notDeepEqual(operating.needle,assembled.needle)
    assert.deepEqual(operating.presserFoot,assembled.presserFoot)
    const end = await pose(312)
    for (const id of Object.keys(home)) for (let k=0;k<16;k++) {
      near(home[id][k],assembled[id][k])
      near(home[id][k],end[id][k])
    }
    await page.getByRole('button', {name:'Play', exact:true}).click()
    await page.waitForFunction(() => {
      const r = document.querySelector('[aria-label="Study sample"]')
      return +r.value > 0 && +r.value < 72 && document.querySelector('[aria-label="Pause"]')
    })
    await page.getByRole('button', {name:'Pause',exact:true}).click()
    assert.deepEqual(errors,[])
    console.log('All 29 poses verified at full spread, reassembly and 720 degrees. Live playback wrapped.')
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode=1 })
