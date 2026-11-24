// Use with Playwright's browser_run_code via this function, or run directly:
// node 04-capture-plate-7.cjs BASE_URL OUTPUT_DIR (requires playwright).
async function capturePlate7(page, base, output) {
  await page.setViewportSize({width: 1600, height: 1000})
  await page.goto(base + '/?preset=CP-02-shutter-blades')
  await page.getByText(/features.*8 bodies/).first().waitFor({timeout: 90000})
  await page.getByRole('button', {name: 'Plan', exact: true}).click()
  await page.getByRole('tab', {name: 'Mechanism', exact: true}).click()
  await page.screenshot({path: output + '/cp02-home.png'})
  await page.getByRole('button', {name: 'Axo', exact: true}).click()
  await page.locator('canvas[aria-label="drafting sheet"]').first()
    .screenshot({path: output + '/cp02-axonometric.png'})
}
module.exports = capturePlate7
if (require.main === module) {
  const { chromium } = require('playwright')
  const [base, output] = process.argv.slice(2)
  if (!base || !output) throw Error('Expected BASE_URL OUTPUT_DIR')
  ;(async () => {
    const browser = await chromium.launch()
    try { await capturePlate7(await browser.newPage(), base, output) }
    finally { await browser.close() }
  })().catch(e => { console.error(e); process.exitCode = 1 })
}
