// From the repo root: node <this script> BASE_URL [PLAYWRIGHT_MODULE]
const assert = require('node:assert/strict')
const {execFileSync} = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require(process.argv[3] || 'playwright')

async function render() {
  const out = path.resolve(__dirname, '../sources/workbench')
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'sg09-frames-'))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1040}})
    await page.goto(new URL('/?preset=SG-09-exploded-head', process.argv[2]).href)
    await page.getByRole('button', {name:/Layout/}).click()
    await page.getByRole('button', {name:/Everything in one tile/}).click()
    await page.getByRole('checkbox',{name:'Loop'}).waitFor({timeout:90000})
    await page.getByRole('button',{name:'Axo',exact:true}).click()
    await page.addStyleTag({content:'.sheethost { width:1280px !important; height:720px !important; flex:none !important; }'})
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas[aria-label="drafting sheet"]')
      return c?.width === 1280 && c.height === 720
    })
    await page.evaluate(() => document.fonts.ready)
    const last = Number(await page.getByRole('slider',{name:'Study sample'}).getAttribute('max'))
    assert.equal(last,312)
    // Row 312 is the duplicate endpoint of this closed loop.
    for (let row = 0; row < last; row++) {
      const png = await page.evaluate(async row => {
        const range = document.querySelector('[aria-label="Study sample"]')
        range.value = row
        range.dispatchEvent(new Event('input',{bubbles:true}))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return document.querySelector('canvas[aria-label="drafting sheet"]').toDataURL('image/png').split(',')[1]
      }, row)
      const frame = path.join(frames,String(row).padStart(4,'0')+'.png')
      fs.writeFileSync(frame, Buffer.from(png,'base64'))
      if (row === 84) fs.copyFileSync(frame,path.join(out,'SG-09-stage.png'))
    }
    execFileSync('ffmpeg',['-loglevel','error','-y','-framerate','24','-i',path.join(frames,'%04d.png'),
      '-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'SG-09-stage.mp4')])
  } finally {
    await browser.close()
    fs.rmSync(frames,{recursive:true,force:true})
  }
}
render().catch(error => { console.error(error); process.exitCode = 1 })
