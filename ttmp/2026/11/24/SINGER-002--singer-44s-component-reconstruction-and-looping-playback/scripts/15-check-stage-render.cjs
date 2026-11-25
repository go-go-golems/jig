// node <script> BASE_URL [PLAYWRIGHT_MODULE]
const assert = require('node:assert/strict')
const {execFileSync} = require('node:child_process')
const path = require('node:path')
const {chromium} = require(process.argv[3] || 'playwright')
async function run() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({viewport:{width:1500,height:980}})
    const errors = []
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message) })
    await page.goto(process.argv[2]+'/?preset=SG-09-exploded-head')
    await page.getByRole('button',{name:/Layout/}).click()
    await page.getByRole('button',{name:/Everything in one tile/}).click()
    await page.getByRole('checkbox',{name:'Loop'}).waitFor({timeout:90000})
    await page.getByRole('slider',{name:'Study sample'}).fill('84')
    await page.getByRole('button',{name:'Render…',exact:true}).click()
    const panel = page.getByRole('dialog',{name:'Render CAD Stage'})
    await panel.getByLabel('Format',{exact:true}).selectOption('Full HD portrait')
    const canvas = panel.locator('canvas')
    assert.deepEqual(await canvas.evaluate(c => [c.width,c.height]),[1080,1920])
    await panel.getByLabel('Format',{exact:true}).selectOption('HD landscape')
    await panel.getByLabel('Zoom').fill('1.7')
    await page.screenshot({path:path.join(__dirname,'../sources/workbench/SG-09-render-camera.png')})
    await panel.getByLabel('Width').fill('640')
    await panel.getByLabel('Height').fill('360')
    await panel.getByLabel('Framing').selectOption('stage')
    await panel.getByLabel('Study frame').fill('90')
    const download = async name => {
      const [file] = await Promise.all([page.waitForEvent('download',{timeout:120000}),
        panel.getByRole('button',{name,exact:true}).click()])
      return file.path()
    }
    const still = await download('Save PNG')
    const expected = await canvas.evaluate(c => c.toDataURL('image/png').split(',')[1])
    assert.equal(require('node:fs').readFileSync(still).toString('base64'),expected)
    const video = await download('Render video')
    const probe = JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',video]))
    const stream = probe.streams[0]
    assert.deepEqual([stream.width,stream.height,stream.nb_read_frames],[640,360,'312'])
    await panel.getByRole('button',{name:'Close',exact:true}).click()
    assert.equal(await page.getByLabel('Study sample').inputValue(),'84')
    assert.deepEqual(errors,[])
    console.log('Preview equals downloaded PNG. Portrait, custom sizing, Stage camera and 312 video frames verified:',stream.codec_name)
  } finally { await browser.close() }
}
run().catch(e => { console.error(e); process.exitCode=1 })
