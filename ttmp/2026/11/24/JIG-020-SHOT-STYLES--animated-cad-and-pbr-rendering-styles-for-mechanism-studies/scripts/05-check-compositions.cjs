// Run against a served workbench: node <script> BASE_URL [PLAYWRIGHT_MODULE]
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {chromium} = require(process.argv[3] || 'playwright')
async function check() {
  const browser = await chromium.launch({args:['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan','--ignore-gpu-blocklist']})
  try {
    const page = await browser.newPage({viewport:{width:1500,height:950}})
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto(process.argv[2]+'/?preset=SG-09-exploded-head')
    await page.getByRole('button',{name:/Layout/}).click()
    await page.getByRole('button',{name:/Everything in one tile/}).click()
    await page.getByRole('checkbox',{name:'Loop'}).waitFor({timeout:90000})
    await page.getByRole('button',{name:'Axo',exact:true}).click()
    await page.getByRole('slider',{name:'Study sample'}).fill('84')
    await page.getByRole('button',{name:'Render…'}).click()
    const panel = page.getByRole('dialog',{name:'Render CAD Stage'})
    const set = (label,value) => panel.getByLabel(label,{exact:true}).fill(String(value))
    const choose = (label,value) => panel.getByLabel(label,{exact:true}).selectOption(value)
    async function capture(name) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.waitForFunction(() => {
        const d = document.querySelector('.stage-render')
        return !!d.querySelector('[role=alert]') || !d.querySelector('footer button').disabled
      },null,{timeout:180000})
      assert.equal(await panel.getByRole('alert').count(),0,await panel.getByRole('alert').allTextContents())
      const bytes = Buffer.from(await panel.locator('canvas').evaluate(c=>c.toDataURL().split(',')[1]),'base64')
      if (name) fs.writeFileSync(path.join(__dirname,'../sources',name+'.png'),bytes)
      return bytes
    }
    await set('Width',800)
    await set('Height',500)
    await set('Zoom',1.7)
    const single = await capture()
    await choose('Composition','front-side')
    assert.ok(!single.equals(await capture('08-front-side')))
    await choose('Composition','detail')
    await choose('Detail part','presserFoot')
    assert.ok(!single.equals(await capture('09-foot-detail')))
    await choose('Composition','turntable')
    assert.ok(!single.equals(await capture('10-turntable')))
    await choose('Composition','preset')
    await set('Study frame',264)
    await choose('Render style','Preset animation')
    await capture('11-motion-trail')
    await set('Study frame',36)
    await capture('12-mid-blend')
    assert.deepEqual(errors,[])
    console.log('Split, inset and orbit differ from the single camera. Authored trail and blend rendered.')
  } finally { await browser.close() }
}
check().catch(e=>{console.error(e);process.exitCode=1})
