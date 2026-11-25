// node 04-check-stage-loop.cjs BASE_URL [PLAYWRIGHT_MODULE]
const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require(process.argv[3] || 'playwright')

async function check(page) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.argv[2] + '/?preset=SG-03-upper-head')
  const loop = page.getByRole('checkbox', { name: 'Loop', exact: true })
  const range = page.getByRole('slider', { name: 'Study sample', exact: true })
  const play = page.getByRole('button', { name: 'Play', exact: true })
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  await loop.waitFor({ timeout: 60000 })
  assert.equal(await loop.isChecked(), false)
  const last = Number(await range.getAttribute('max'))
  assert.ok(last > 2)
  const crank = () => page.evaluate(() => {
    const state = document.querySelector('.sheethost').jigStage._state()
    return Array.from(state.scene.instances.find(i => i.body.part === 'crank').M)
  })
  const home = await crank()
  await loop.check()
  await range.fill(String(last - 1))
  await play.click()
  await page.waitForFunction(() => {
    const range = document.querySelector('[aria-label="Study sample"]')
    return +range.value > 0 && +range.value < +range.max / 2
      && document.querySelector('[aria-label="Pause"]')
  })
  await pause.click()
  const sampledRow = await range.inputValue()
  assert.notDeepEqual(await crank(), home)
  await page.screenshot({path: path.join(__dirname, '../sources/stage-loop.png')})
  await play.click()
  await loop.uncheck()
  await play.waitFor({ timeout: 15000 })
  assert.equal(Number(await range.inputValue()), last)
  await page.getByRole('button', { name: 'Exit preview' }).click()
  await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.deepEqual(await crank(), home)
  assert.deepEqual(errors, [])
  console.log('SG-03 wrapped, paused at row ' + sampledRow +
    ', stopped at ' + last + ' after Loop was unchecked, restored home.')
}

;(async () => {
  if (!process.argv[2]) throw Error('Supply the workbench URL')
  const browser = await chromium.launch()
  try { await check(await browser.newPage({ viewport: { width: 1440, height: 960 } })) }
  finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
