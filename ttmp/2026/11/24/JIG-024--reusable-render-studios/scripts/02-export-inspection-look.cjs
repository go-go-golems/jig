// node SCRIPT URL PLAYWRIGHT_MODULE CHROMIUM_EXECUTABLE RESULT_DIR
const fs=require('node:fs')
const path=require('node:path')
const {chromium}=require(process.argv[3])
async function main(){
 const out=process.argv[5], browser=await chromium.launch({executablePath:process.argv[4],
   args:['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan','--ignore-gpu-blocklist']})
 try {
  const page=await browser.newPage({viewport:{width:1450,height:1000}})
  await page.goto(process.argv[2]+'/?preset=SG-04-needle-hardware')
  await page.getByRole('button',{name:/Layout/}).click()
  await page.getByRole('button',{name:/Everything in one tile/}).click()
  await page.getByRole('button',{name:'Axo',exact:true}).click({timeout:90000})
  await page.getByRole('button',{name:'Render…'}).click()
  const d=page.getByRole('dialog',{name:'Render CAD Stage'}), f=n=>d.getByLabel(n,{exact:true})
  await f('Width').fill('224');await f('Height').fill('160')
  await d.locator('summary',{hasText:'Render studio'}).click()
  await f('Import studio').setInputFiles(path.join(out,'blue-studio.json'))
  await d.getByRole('button',{name:'Save and apply studio'}).click()
  await f('Spark SPP').fill('4');await f('Render style').selectOption('PBR')
  const download=page.waitForEvent('download')
  await d.getByRole('button',{name:'Export Spark job'}).click()
  await(await download).saveAs(path.join(out,'blue-still.zip'))
  await d.screenshot({path:path.join(out,'studio-controls.png')})
 } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
