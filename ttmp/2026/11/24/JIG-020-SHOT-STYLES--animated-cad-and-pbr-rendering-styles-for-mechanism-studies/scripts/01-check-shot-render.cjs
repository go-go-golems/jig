// node scripts/01-check-shot-render.cjs BASE_URL [PLAYWRIGHT_MODULE]
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {execFileSync} = require('node:child_process')
const {chromium} = require(process.argv[3] || 'playwright')
const sources = path.join(__dirname, '../sources')

// The CAD image supplies a separate projected outline. On these slender
// Singer parts almost every shaded pixel lies within 3 pixels of a CAD edge.
function checkRegistration() {
  const pixels = name => execFileSync('ffmpeg',['-v','error','-i',path.join(sources,name+'.png'),
    '-f','rawvideo','-pix_fmt','rgb24','-'])
  const cad = pixels('01-spread-cad'), beauty = pixels('02-spread-pbr')
  const width = 480, height = 320
  let foreground = 0, registered = 0
  for (let y = 3; y < height-3; y++) for (let x = 3; x < width-3; x++) {
    const i = (y*width + x)*3
    if (Math.max(...[0,1,2].map(c => Math.abs(beauty[i+c]-beauty[c]))) <= 10) continue
    foreground++
    let found = false
    for (let dy = -3; dy <= 3 && !found; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (dx*dx+dy*dy <= 9 && cad[i+(dy*width+dx)*3] < 100) { found = true; break }
    }
    if (found) registered++
  }
  assert.ok(foreground > 1000, 'PBR draws the exploded pieces')
  assert.ok(registered / foreground > 0.90, 'PBR and CAD use the same spread and projection')
  console.log('Registered foreground pixels:', registered, '/', foreground)
}

async function main() {
  fs.mkdirSync(sources, {recursive:true})
  const browser = await chromium.launch({args:[
    '--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan',
    '--use-vulkan','--ignore-gpu-blocklist',
  ]})
  const errors = []
  try {
    const page = await browser.newPage({viewport:{width:1450,height:920},acceptDownloads:true})
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message) })
    page.on('console', m => { if (m.type() === 'error') console.error(m.text()) })
    await page.goto(process.argv[2]+'/?preset=SG-09-exploded-head')
    await page.getByRole('button',{name:/Layout/}).click()
    await page.getByRole('button',{name:/Everything in one tile/}).click()
    await page.getByRole('checkbox',{name:'Loop'}).waitFor({timeout:90000})
    const keys = await page.evaluate(() => jigHost.program.assembly.studies['Stitch cycle'].shot)
    assert.ok(keys.some(k => k.trail?.component === 'needle' && k.accent?.components.includes('crank')))
    await page.getByRole('button',{name:'Axo',exact:true}).click()
    await page.getByRole('slider',{name:'Study sample'}).fill('84')
    await page.getByRole('button',{name:'Render…',exact:true}).click()
    const panel = page.getByRole('dialog',{name:'Render CAD Stage'})
    const style = panel.getByLabel('Render style')
    const canvas = panel.locator('canvas')
    const waitReady = async () => {
      await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))))
      await page.waitForFunction(() => {
        const dialog = document.querySelector('.stage-render')
        return dialog.querySelector('[role=alert]') || !dialog.querySelector('footer button').disabled
      },undefined,{timeout:180000})
      const error = panel.getByRole('alert')
      if (await error.count()) throw Error(await error.textContent())
    }
    const snapshot = async name => {
      await waitReady()
      const data = await canvas.evaluate(c => c.toDataURL().split(',')[1])
      const file = path.join(sources,name+'.png')
      fs.writeFileSync(file,Buffer.from(data,'base64'))
      console.log('Verified preview',name)
      return data
    }
    await panel.getByLabel('Width').fill('480')
    await panel.getByLabel('Height').fill('320')
    await panel.getByLabel('Zoom').fill('1.7')
    const line = await snapshot('01-spread-cad')
    await style.selectOption('PBR')
    const pbr = await snapshot('02-spread-pbr')
    assert.notEqual(pbr,line)
    checkRegistration()
    await style.selectOption('PBR + CAD edges')
    const edge = await snapshot('03-spread-overlay')
    assert.notEqual(edge,pbr)
    await page.screenshot({path:path.join(sources,'04-overlay-controls.png')})
    await style.selectOption('Preset animation')
    const flat = await snapshot('05-spread-shot')
    assert.notEqual(flat,pbr)
    await panel.getByLabel('Study frame').fill('204') // 8.5 s, isolated section
    const section = await snapshot('06-presser-section')
    const [download] = await Promise.all([page.waitForEvent('download'),panel.getByRole('button',{name:'Save PNG'}).click()])
    assert.equal(fs.readFileSync(await download.path()).toString('base64'),section)
    await panel.getByLabel('Study frame').fill('266')
    await snapshot('08-drive-and-trail')
    await panel.getByLabel(/Samples per pixel/).selectOption('4')
    await waitReady()
    const movie = page.waitForEvent('download',{timeout:600000})
    await panel.getByRole('button',{name:'Render video'}).click()
    const timer = setInterval(async () => {
      try { console.log('Video progress',await panel.locator('output').textContent({timeout:1000})) }
      catch { /* between progress updates */ }
    },20000)
    let video
    try {
      video = await Promise.race([movie,panel.getByRole('alert').waitFor({timeout:600000}).then(async () => {
        throw Error(await panel.getByRole('alert').textContent())
      })])
    } finally { clearInterval(timer) }
    const file = path.join(sources,'07-sg09-shot'+path.extname(video.suggestedFilename()))
    await video.saveAs(file)
    const probe = JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',file]))
    const stream = probe.streams[0]
    assert.deepEqual([stream.width,stream.height,stream.nb_read_frames],[480,320,'312'])
    console.log('Verified 312 decoded frames at',stream.r_frame_rate,'fps',stream.codec_name)
    assert.deepEqual(errors,[])
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode=1 })
