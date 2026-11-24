// node capture-workbench.cjs BASE_URL OUTPUT_DIR [PLAYWRIGHT_PACKAGE]
// Starts a fresh browser context. The temporary copy in A-01 disappears on close.
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')

async function main() {
  const [url, output, playwright = 'playwright'] = process.argv.slice(2)
  if (!url || !output) throw Error('Expected a running Jig URL and an output directory')
  const { chromium } = require(playwright)
  mkdirSync(output, { recursive: true })
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await context.newPage()
    const sheet = page.locator('canvas[aria-label="drafting sheet"]').first()
    async function open(slug) {
      const preset = new URL(url)
      preset.searchParams.set('preset', slug)
      await page.goto(preset.href)
      await page.getByText(/features.*bodies/).first().waitFor({ timeout: 120000 })
    }

    await open('CP-03-speed-escapement')
    await page.getByRole('button', { name: 'Plan', exact: true }).click()
    await page.getByRole('tab', { name: 'Mechanism', exact: true }).click()
    await page.screenshot({ path: join(output, 'compur-escapement.png') })
    await open('CP-07-delayed-action')
    await page.getByRole('button', { name: 'Axo', exact: true }).click()
    await sheet.screenshot({ path: join(output, 'compur-self-timer.png') })
    await open('M-11-synchro-compur')
    await sheet.screenshot({ path: join(output, 'compur-m11.png') })

    await page.goto(new URL('?preset=A-01-box', url).href)
    await page.getByRole('tab', { name: 'Code', exact: true }).click()
    const filesMenu = page.getByTitle('Every file of the preset')
    await filesMenu.click()
    await page.getByLabel('Copy a published part file').selectOption('["M-11","compur.parts.js"]')
    await filesMenu.click()
    const tab = page.getByRole('tab', { name: /compur.parts.js/ })
    await tab.waitFor()
    const tabBox = await tab.boundingBox()
    const codeBox = await page.locator('.codeview').boundingBox()
    await page.screenshot({ path: join(output, 'compur-library.png'),
      clip: { x: codeBox.x, y: tabBox.y - 8, width: codeBox.width, height: 460 } })
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
