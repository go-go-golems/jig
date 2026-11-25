// node SCRIPT URL PLAYWRIGHT_MODULE CHROMIUM_EXECUTABLE RESULT_DIR
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {execFileSync} = require('node:child_process')
const {chromium} = require(process.argv[3])
async function main() {
  const out = process.argv[5]
  fs.mkdirSync(out,{recursive:true})
  const browser = await chromium.launch({executablePath:process.argv[4],
    args:['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan','--ignore-gpu-blocklist']})
  try {
    const page = await browser.newPage({viewport:{width:1500,height:1000}})
    const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
    await page.goto(process.argv[2]+'/?preset=SG-09-exploded-head')
    await page.getByRole('button',{name:/Layout/}).click()
    await page.getByRole('button',{name:/Everything in one tile/}).click()
    await page.getByRole('checkbox',{name:'Loop'}).waitFor({timeout:90000})
    await page.getByRole('button',{name:'Axo',exact:true}).click()
    await page.getByRole('button',{name:'Render…'}).click()
    const d=page.getByRole('dialog',{name:'Render CAD Stage'})
    const field=name=>d.getByLabel(name,{exact:true})
    const button=name=>d.getByRole('button',{name,exact:true})
    const tick=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
    async function capture(){
      await tick()
      await page.waitForFunction(()=>document.querySelector('.stage-render footer [role=alert]') ||
        [...document.querySelectorAll('.stage-render button')].some(b=>b.textContent==='Save PNG' && !b.disabled),null,{timeout:90000})
      assert.equal(await d.locator('footer [role=alert]').count(),0,(await d.locator('footer [role=alert]').allTextContents()).join())
      return d.getByLabel('Render camera preview').evaluate(c=>c.toDataURL())
    }
    async function download(btn,name){
      if (btn !== 'Export Spark job') await capture()
      const result=page.waitForEvent('download',{timeout:180000})
      await button(btn).click()
      await (await result).saveAs(path.join(out,name))
    }
    await field('Width').fill('320'); await field('Height').fill('240')
    await d.locator('summary',{hasText:'Work area'}).click()
    await field('First output frame').fill('315')
    assert.ok(await button('Render video').isDisabled())
    await field('Last output frame').fill('205'); await field('First output frame').fill('203')
    for(const [label,row] of [['Preview first',203],['Preview last',205]]) {
      await button(label).click()
      const a=await capture()
      await field('Study frame').fill('0'); await capture()
      await field('Study frame').fill(String(row))
      assert.equal(await capture(),a)
    }
    await download('Render video','browser-range.mp4')
    await field('Last output frame').fill('203'); await download('Render video','browser-one.mp4')
    for(const [name,count] of [['browser-range.mp4','3'],['browser-one.mp4','1']]) {
      const result=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=nb_read_frames','-of','json',path.join(out,name)]))
      assert.equal(result.streams[0].nb_read_frames,count)
    }
    await field('Last output frame').fill('205')
    await field('Render style').selectOption('Preset animation')
    await field('Samples per pixel').selectOption('1'); await field('Spark SPP').fill('1')
    await d.locator('summary',{hasText:'Render studio'}).click()
    await field('Studio name').fill('Workshop EV7'); await field('Fixed EV').fill('7')
    await button('Save and apply studio').click()
    await download('Export Spark job','range.zip')
    await field('Last output frame').fill('203')
    await field('Composition').selectOption('front-side')
    await download('Export Spark job','single-split.zip')
    await d.screenshot({path:path.join(out,'work-area.png')})
    console.log('Both endpoints match the full shot preview. Browser 3-frame and 1-frame movies decoded; Spark ZIPs saved.')
    assert.deepEqual(errors,[])
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
