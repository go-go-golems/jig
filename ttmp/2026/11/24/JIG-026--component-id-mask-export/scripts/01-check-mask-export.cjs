// node <script> http://127.0.0.1:18965 /path/to/playwright
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { chromium } = require(process.argv[3] || 'playwright')
const out = path.resolve(__dirname, '../sources')
const sweep = path.resolve(__dirname, '../../JIG-025--animated-section-sweeps/sources')

async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true})
    await page.goto(process.argv[2] + '/?preset=SG-09-exploded-head')
    await page.getByRole('button',{name:/Layout/}).click()
    await page.getByRole('button',{name:/Everything in one tile/}).click()
    await page.getByRole('checkbox',{name:'Loop'}).waitFor({timeout:90000})
    await page.getByRole('button',{name:'Axo',exact:true}).click()
    await page.evaluate(() => {
      const keys = structuredClone(jigHost.program.assembly.studies['Stitch cycle'].shot)
      const key = keys.find(key => key.section)
      Object.assign(key.section,{offset:-6,endOffset:6,endTime:9.5})
      key.surface = 0
      keys.find(k => k.time === 9.75).surface = 0
      jigHost.setFile('shots.json',JSON.stringify({'Stitch cycle':keys}))
      const stage = document.querySelector('.sheethost').jigStage
      const original = stage.renderCamera
      stage.renderCamera = function(study) {
        const draw = original.call(this,study)
        window.maskCheck = {draw,study}
        return (canvas, settings, beauty) => {
          window.maskCheck.settings = settings
          return draw(canvas, settings, beauty)
        }
      }
    })
    await page.getByRole('slider',{name:'Study sample'}).fill('84')
    await page.getByRole('button',{name:'Render…',exact:true}).click()
    const panel = page.getByRole('dialog',{name:'Render CAD Stage'})
    const frame = panel.getByLabel('Study frame')
    const output = panel.getByLabel('Render output')
    const png = panel.getByRole('button',{name:'Save PNG',exact:true})
    async function ready() {
      await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))))
      await page.waitForFunction(() => {
        const dialog = document.querySelector('.stage-render')
        return dialog.querySelector('[role=alert]') || !Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Save PNG').disabled
      })
      const errors = await panel.getByRole('alert').allTextContents()
      assert.deepEqual(errors,[])
    }
    async function download(button,dst) {
      await ready()
      const [file] = await Promise.all([page.waitForEvent('download'),button.click()])
      await file.saveAs(dst)
    }
    await panel.getByLabel('Width',{exact:true}).fill('480')
    await panel.getByLabel('Height',{exact:true}).fill('320')
    await panel.getByLabel('Zoom',{exact:true}).fill('2.4')
    await output.selectOption('mask')
    await panel.getByLabel('Render style').selectOption('Preset animation')
    const legendFile = path.join(out,'mask-legend.json')
    await download(panel.getByRole('button',{name:'Save ID legend'}),legendFile)
    const legend = JSON.parse(fs.readFileSync(legendFile))
    assert.equal(legend.components.length,29)
    const allowed = Object.fromEntries(legend.components.map(c => [c.color,c.id]))
    async function check(name,row) {
      await frame.fill(String(row))
      const file = path.join(out,name + '.png')
      await download(png,file)
      const result = await page.evaluate(async ({allowed,row,bytes}) => {
        // Decode the downloaded bytes, independent of the preview canvas.
        const blob = await (await fetch('data:image/png;base64,'+bytes)).blob()
        const png = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = png.width; canvas.height = png.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(png,0,0)
        const pixels = ctx.getImageData(0,0,png.width,png.height).data
        const names = new Set(), counts = {}
        const {draw,settings} = window.maskCheck
        const another = document.createElement('canvas')
        const regular = await draw(another,{...settings, componentMask:null, style:{...settings.style,surface:0}})
        const compare = regular?.buf // composite layouts have separate depth buffers per panel
        const ids = regular?.scene.instances.map(inst => inst.body.part ?? inst.body.id)
        if (row === 210 && !settings.layout) {
          if (settings.style.section?.offset !== 0) throw Error('Expected sweep midpoint')
        }
        for(let i=0;i<pixels.length;i+=4) {
          const color = '#' + ((pixels[i]<<16) + (pixels[i+1]<<8) + pixels[i+2]).toString(16).padStart(6,'0')
          if (pixels[i+3] !== 255) throw Error('Transparent pixel')
          if (compare) {
            const face = compare.id[i / 4]
            const expected = face < 0 ? undefined : ids[regular.scene.faceInst[face]]
            if (allowed[color] !== expected) throw Error('Mask disagrees with ordinary drafting depth at pixel '+i/4)
          }
          if (color === '#000000') continue
          if (!Object.hasOwn(allowed,color)) throw Error('Undeclared color '+color)
          names.add(allowed[color]); counts[allowed[color]] = (counts[allowed[color]] ?? 0) + 1
        }
        return {names:[...names].sort(), counts}
      },{allowed,row,bytes:fs.readFileSync(file).toString('base64')})
      return result
    }
    const spread = await check('spread-mask',84)
    assert.ok(spread.names.includes('needle') && spread.names.includes('crank'))
    const cut = await check('presser-section-mask',210)
    assert.deepEqual(cut.names,['presserBar','presserFoot','presserGuide','presserShank'])
    await panel.getByLabel('Composition',{exact:true}).selectOption('front-side')
    await check('front-side-mask',210)
    await panel.getByLabel('Composition',{exact:true}).selectOption('detail')
    await panel.getByLabel('Detail part').selectOption('presserGuide')
    await check('inset-mask',210)
    await panel.getByLabel('Composition',{exact:true}).selectOption('preset')
    await output.selectOption('image')
    for(const row of [192,210,228]) {
      await frame.fill(String(row))
      await download(png,path.join(sweep,'sweep-'+row+'.png'))
    }
    await output.selectOption('mask')
    await panel.getByText(/Work area ·/).click()
    await panel.getByLabel('Last output frame').fill('211')
    await panel.getByLabel('First output frame').fill('209')
    await download(panel.getByRole('button',{name:'Save mask sequence'}),path.join(out,'mask-sequence.zip'))
    await download(panel.getByRole('button',{name:'Render preview video'}),path.join(out,'mask-preview.mp4'))
    await page.screenshot({path:path.join(out,'mask-workbench.png')})
    console.log(JSON.stringify({spread:spread.names.length,section:cut.counts},null,2))
    const files = execFileSync('unzip',['-Z1',path.join(out,'mask-sequence.zip')],{encoding:'utf8'}).trim().split('\n')
    assert.deepEqual(files,['frames/000209.png','frames/000210.png','frames/000211.png','legend.json'])
    const png210 = execFileSync('unzip',['-p',path.join(out,'mask-sequence.zip'),'frames/000210.png'])
    assert.deepEqual(png210,fs.readFileSync(path.join(out,'presser-section-mask.png')))
    assert.equal(JSON.parse(execFileSync('unzip',['-p',path.join(out,'mask-sequence.zip'),'legend.json'])).first,209)
    const probe=execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=nb_read_frames','-of','csv=p=0',path.join(out,'mask-preview.mp4')],{encoding:'utf8'})
    assert.equal(probe.trim(),'3')
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode=1 })
