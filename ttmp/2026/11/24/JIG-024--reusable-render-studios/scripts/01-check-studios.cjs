// node SCRIPT URL PLAYWRIGHT_MODULE CHROMIUM_EXECUTABLE RESULT_DIR
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {chromium}=require(process.argv[3])
async function main(){
 const out=process.argv[5]; fs.mkdirSync(out,{recursive:true})
 const browser=await chromium.launch({executablePath:process.argv[4],
  args:['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan','--ignore-gpu-blocklist']})
 try {
  const page=await browser.newPage({viewport:{width:1360,height:1050}})
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
  const d=page.getByRole('dialog',{name:'Render CAD Stage'})
  const f=name=>d.getByLabel(name,{exact:true}), b=name=>d.getByRole('button',{name,exact:true})
  async function open(){
   await page.getByRole('button',{name:/Layout/}).click()
   await page.getByRole('button',{name:/Everything in one tile/}).click()
   await page.getByRole('button',{name:'Axo',exact:true}).click({timeout:90000})
   await page.getByRole('button',{name:'Render…'}).click()
   await f('Width').fill('224');await f('Height').fill('160')
   await f('Render style').selectOption('PBR');await f('Samples per pixel').selectOption('1')
   await d.locator('summary',{hasText:'Render studio'}).click()
  }
  async function ready(){
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
   await page.waitForFunction(()=>!!document.querySelector('.stage-render [role=alert]') ||
     [...document.querySelectorAll('.stage-render button')].some(el=>el.textContent==='Save PNG'&&!el.disabled),null,{timeout:180000})
   assert.equal(await d.getByRole('alert').count(),0,(await d.getByRole('alert').allTextContents()).join())
  }
  async function image(file){
   await ready()
   const data=await f('Render camera preview').evaluate(c=>c.toDataURL().split(',')[1])
   fs.writeFileSync(path.join(out,file),Buffer.from(data,'base64'))
   return data
  }
  await page.goto(process.argv[2]+'/?preset=SG-04-needle-hardware')
  await open()
  const scene=d.getByLabel('Candela scene (lights, materials and background)',{exact:true})
  const original=await scene.inputValue()
  await f('Studio name').fill('Machined metal');await f('Fixed EV').fill('7')
  await b('Save and apply studio').click();await image('machined.png')
  await f('Studio name').fill('Blue inspection')
  await d.locator('summary',{hasText:'Build an inspection look'}).click()
  await f('Material component').fill('*'); await f('Material color').fill('#305ac9')
  await b('Use generated scene').click()
  const blue=await scene.inputValue()
  assert.notEqual(blue,original)
  await f('Fixed EV').fill('9')
  await b('Save and apply studio').click();await image('blue.png')
  const record=await page.evaluate(()=>JSON.parse(jigHost.files.get('render-studios.json')))
  assert.equal(record.studios.length,2);assert.equal(record.active,'Blue inspection')
  assert.equal(record.studios[1][1].ev,9);assert.equal(record.studios[1][1].source,blue)
  const down=page.waitForEvent('download');await b('Export studio').click();await(await down).saveAs(path.join(out,'blue-studio.json'))
  await f('Render style').selectOption('CAD lines');await f('Active studio').selectOption('Machined metal');await ready()
  assert.equal(await f('Fixed EV').inputValue(),'7')
  await page.reload();await open();await ready()
  assert.equal(await f('Active studio').inputValue(),'Machined metal')
  await f('Active studio').selectOption('Blue inspection');await ready()
  assert.equal(await scene.inputValue(),blue)
  await b('Remove studio').click();await ready()
  assert.equal(await f('Active studio').inputValue(),'')
  await page.goto(process.argv[2]+'/?preset=SG-06-presser-foot');await open()
  await f('Import studio').setInputFiles(path.join(out,'blue-studio.json'))
  await b('Save and apply studio').click();await ready()
  assert.equal(await f('Active studio').inputValue(),'Blue inspection')
  assert.equal(await f('Fixed EV').inputValue(),'9');assert.equal(await scene.inputValue(),blue)
  await d.screenshot({path:path.join(out,'studio-controls.png')})
  assert.deepEqual(errors,[])
  console.log('Saved and switched two looks; source and EV persisted after reload and transfer to SG-06.')
 } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
