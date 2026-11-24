// node 03-capture-workbench.cjs BASE_URL [PLAYWRIGHT_MODULE]
const { chromium } = require(process.argv[3] || 'playwright')
const path = require('node:path')
async function capture() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 960}})
    for (const [slug, count] of [
      ['SG-01-needle-drive', 8], ['SG-02-needle-swing', 6],
      ['SG-03-upper-head', 10],
    ]) {
      await page.goto(process.argv[2] + '/?preset=' + slug)
      await page.getByText(new RegExp('features.*' + count + ' bodies'))
        .first().waitFor({timeout: 60000})
      await page.getByRole('button', {name: 'Front', exact: true}).click()
      await page.screenshot({path: path.join(__dirname, '../sources', slug + '.png')})
      if (count === 10) {
        await page.getByRole('button', {name: 'Axo', exact: true}).click()
        await page.locator('canvas[aria-label="drafting sheet"]').first()
          .screenshot({path: path.join(__dirname, '../sources/head-axonometric.png')})
      }
    }
  } finally { await browser.close() }
}
capture().catch(e => { console.error(e); process.exitCode = 1 })
