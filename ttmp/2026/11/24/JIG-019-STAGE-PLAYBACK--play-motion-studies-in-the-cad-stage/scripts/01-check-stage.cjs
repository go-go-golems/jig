// Run against a locally served Jig workbench. The browser profile is ephemeral.
// node 01-check-stage.cjs BASE_URL [PLAYWRIGHT_MODULE]
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.argv[3] || 'playwright')
const url = process.argv[2]
if (!url) throw Error('Supply the workbench URL')
const sources = process.argv[4] || path.resolve(__dirname, '../sources')
fs.mkdirSync(sources, { recursive: true })
const oldTrace = path.resolve(__dirname,
  '../../SINGER-001--singer-44s-upper-stitch-head/sources/upper-head-cycle.tsv')

async function check(page) {
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const play = page.getByRole('button', { name: 'Play', exact: true })
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  const range = page.getByRole('slider', { name: 'Study sample', exact: true })
  const exit = page.getByRole('button', { name: 'Exit preview', exact: true })
  const nextDraw = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))))
  async function seek(row) {
    await range.fill(String(row))
    await nextDraw()
  }
  function sheet() { return page.locator('canvas[aria-label="drafting sheet"]') }
  function capture(name) { return page.screenshot({ path: path.join(sources, name) }) }
  const pose = id => page.evaluate(id => {
    const state = document.querySelector('.sheethost').jigStage._state()
    return Array.from(state.scene.instances.find(i => i.body.part === id).M)
  }, id)
  const calls = () => page.evaluate(() => window.acceptanceCalls.slice())
  const getOverrides = () => page.evaluate(() => ({ ...jigHost.overrides }))

  await page.goto(url + '/?preset=F-06-slider-crank-mechanism')
  await play.waitFor({timeout: 60000})
  await range.waitFor()
  await page.evaluate(() => {
    const request = jigHost.engine.request.bind(jigHost.engine)
    window.acceptanceCalls = []
    jigHost.engine.request = (op, args) => {
      window.acceptanceCalls.push(op === 'call' ? args.method : op)
      return request(op, args)
    }
    const context = document.querySelector('canvas[aria-label="drafting sheet"]').getContext('2d')
    const fill = context.fillText.bind(context)
    context.fillText = (label, x, y, ...rest) => {
      if (/^pin(?:\s|$)/.test(label)) window.pinLabel = [x, y]
      return fill(label, x, y, ...rest)
    }
  })
  const initial = await pose('crank')
  await play.click()
  await page.waitForFunction(() => +document.querySelector('[aria-label="Study sample"]').value > 5)
  await pause.click()
  const paused = await range.inputValue()
  await nextDraw()
  assert.equal(await range.inputValue(), paused)
  await seek(90)
  assert.notDeepEqual(await pose('crank'), initial)
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await nextDraw()
  const markerError = await page.evaluate(() => {
    const state = document.querySelector('.sheethost').jigStage._state()
    const crank = state.scene.instances.find(i => i.body.part === 'crank')
    const M = crank.M, cam = state.cam
    // F-06 puts the crank pin at (+15.5/2, 0, 6) in its own coordinates.
    const pin = [0, 1, 2].map(i => M[i]*7.75 + M[8+i]*6 + M[12+i] - cam.T[i])
    const dot = a => pin.reduce((v, p, i) => v + p*a[i], 0)
    const projected = [cam.W/2 + cam.s*dot(cam.r), cam.Y0 - cam.s*dot(cam.u)]
    if (!window.pinLabel) throw Error('Crank pin joint label was never drawn')
    return Math.hypot(pinLabel[0] - projected[0] - 12, pinLabel[1] - projected[1] + 10)
  })
  assert.ok(markerError < 1, 'Crank pin overlay misses mesh by ' + markerError + ' px')
  const picked = await page.evaluate(() => {
    const state = document.querySelector('.sheethost').jigStage._state()
    const {buf, scene, k} = state
    for (let y = 8; y < buf.h-8; y += 4) for (let x = 8; x < buf.w-8; x += 4) {
      const id = buf.id[y*buf.w+x]
      if (id < 0) continue
      const inst = scene.instances[scene.faceInst[id]]
      if (inst.body.part !== 'rod') continue
      if ([-7,7,-7*buf.w,7*buf.w].every(d => buf.id[y*buf.w+x+d] === id)) {
        return { x: (x+0.5)/k, y: (y+0.5)/k, body: inst.body.id, face: id-inst.base }
      }
    }
    throw Error('No interior pixel on the posed rod')
  })
  await sheet().click({ position: { x: picked.x, y: picked.y } })
  const selection = await page.evaluate(() => ({ ...jigHost.selection, body: jigHost.program.bodies[jigHost.selection.body].id }))
  assert.equal(selection.body, picked.body)
  assert.equal(selection.face, picked.face)
  await capture('f06-quarter-turn.png')
  await page.evaluate(() => jigHost.select(null))
  await nextDraw()
  await page.evaluate(() => { window.acceptanceCalls.length = 0 })
  await seek(360)
  await play.click()
  await page.waitForFunction(() => {
    const v = +document.querySelector('[aria-label="Study sample"]').value
    return v > 0 && v < 360
  })
  await play.waitFor({timeout: 15000})
  assert.equal(await range.inputValue(), '360')
  assert.deepEqual(await calls(), [])
  assert.deepEqual(await getOverrides(), {})
  await exit.click()
  await nextDraw()
  assert.deepEqual(await pose('crank'), initial)
  console.log('F-06: pause, seek, replay, native overlay/picking and restore passed; worker calls during inspection:', await calls())

  // The archived TSV belongs to the original upper-head reconstruction.
  // Replay its matching source against the live Stage renderer.
  const singerFiles = Object.fromEntries(['script.js', 'singer.parts.js'].map(file =>
    [file, require('node:child_process').execFileSync('git', ['show',
      'ba235fe:import/jigcad/content/presets/SG-03-upper-head/' + file],
      { encoding: 'utf8' })]))
  await page.evaluate(async files => {
    await jigHost.loadPreset('SG-03')
    for (const [file, source] of Object.entries(files)) jigHost.setFile(file, source)
    await jigHost.compileNow()
  }, singerFiles)
  await play.waitFor()
  await page.getByRole('button', {name: 'Front', exact:true}).click()
  const samples = fs.readFileSync(oldTrace, 'utf8').trim().split('\n').slice(1)
    .map(line => line.split('\t').map(Number))
  const rows = await page.evaluate(() => Object.values(jigHost.program.assembly.studies)[0].rows.map(r => r.x))
  const snapshots = new Map([[0, 'singer-000.png'],[180, 'singer-180.png'],[360, 'singer-360.png']])
  let maxError = 0, closureError = 0
  for (const [phase, ...expected] of samples) {
    const row = rows.findIndex(v => Math.abs(v-phase) < 1e-6)
    assert.ok(row >= 0, 'missing shaft sample at ' + phase)
    await seek(row)
    const {points, closure} = await page.evaluate(() => {
      const instances = document.querySelector('.sheethost').jigStage._state().scene.instances
      const point = (id, x, z) => {
        const m = instances.find(i => i.body.part === id).M
        return [m[0]*x+m[8]*z+m[12],m[2]*x+m[10]*z+m[14]]
      }
      const distance = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1])
      return {
        points: [...point('needle',0,-17), ...point('lever',-20,-9)],
        closure: Math.max(distance(point('crank',0,-12),point('rod',32,0)),
          distance(point('lever',22,0),point('rocker',20,0))),
      }
    })
    const err = Math.max(...expected.map((v,i) => Math.abs(v-points[i])))
    maxError = Math.max(maxError, err)
    closureError = Math.max(closureError, closure)
    assert.ok(err < 0.001, phase + ' degree reference mismatch: ' + err + ' mm')
    assert.ok(closure < 1e-5, phase + ' degree linkage gap: ' + closure + ' mm')
    if (snapshots.has(phase)) await capture(snapshots.get(phase))
  }
  console.log('SG-03:', samples.length, 'Stage samples verified; maximum coordinate error',
    maxError.toFixed(6), 'mm; maximum linkage gap', closureError.toExponential(2), 'mm')
  await play.click()
  await pause.waitFor()
  const source = await page.evaluate(() => jigHost.files.get('script.js'))
  await page.evaluate(async () => {
    jigHost.setFile('script.js', 'invalid @')
    await jigHost.compileNow()
  })
  await play.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(() => jigHost.program.ok), false)
  await page.evaluate(async source => {
    jigHost.setFile('script.js', source)
    await jigHost.compileNow()
  }, source)
  await play.waitFor()
  await page.evaluate(() => {
    const call = jigHost.call.bind(jigHost)
    jigHost.call = async (method, ...args) => {
      const value = await call(method, ...args)
      if (method === 'studyTrack' && jigHost.preset.id === 'F-06') {
        await new Promise(resolve => { window.releaseOldTrack = resolve })
      }
      return value
    }
    window.pendingLoad = jigHost.loadPreset('F-06')
  })
  await page.waitForFunction(() => typeof window.releaseOldTrack === 'function')
  await page.evaluate(() => jigHost.loadPreset('A-01'))
  await page.evaluate(() => releaseOldTrack())
  await nextDraw()
  await play.waitFor({state:'hidden'})
  assert.deepEqual(await getOverrides(), {})
  console.log('Failed compile, recovery, stale reply after preset switch and static part passed')

  const fixture = fs.readFileSync('import/jigcad/test/engine/scripts/53-limits.js', 'utf8')
  await page.evaluate(code => jigHost.loadScratch({ 'script.js': code }, { title: 'Limited hinge' }),
    fixture + "\n  .study('closing', { drive: 'h', from: deg(110), to: deg(0), steps: 11 })\n  .study('single', { drive: 'h', from: deg(110), to: deg(120), steps: 1 })")
  const selector = page.getByRole('combobox', { name: 'Motion study' })
  await selector.selectOption('open')
  await seek(10) // 100 degrees, one step before the hinge limit.
  await play.click()
  await page.getByText(/Unreachable at 120°/).waitFor()
  assert.equal(await range.inputValue(), '11')
  const atLimit = await pose('lid')
  await seek(15)
  assert.equal(await range.inputValue(), '11')
  assert.deepEqual(await pose('lid'), atLimit)
  await selector.selectOption('closing')
  await seek(1)
  assert.equal(await range.getAttribute('aria-valuetext'), '100°')
  await seek(11)
  assert.equal(await range.getAttribute('aria-valuetext'), '0°')
  assert.notDeepEqual(await pose('lid'), atLimit)
  await selector.selectOption('single')
  await page.getByRole('button', { name: 'Show pose' }).click()
  assert.ok((await pose('lid')).every((v, i) => Math.abs(v - atLimit[i]) < 1e-9))
  await exit.click()

  assert.deepEqual(errors, [])
  console.log('Limited hinge: reachable endpoint held on gap, invalid scrub held, descending study passed')
}
;(async () => {
  const browser = await chromium.launch()
  try { await check(await browser.newPage({ viewport: { width: 1520, height: 980 } })) }
  finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
