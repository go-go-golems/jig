// Check independent failure domains, canceled previews, and canceled exports
// using the same Stage toolbar a person uses.
const assert = require('node:assert/strict')
const { chromium } = require(process.argv[3] || 'playwright')
const base = process.argv[2]
async function main() {
  const browser = await chromium.launch({args:[
    '--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan',
    '--use-vulkan','--ignore-gpu-blocklist',
  ]})
  const errors = []
  async function open(slug, noGPU = false) {
    const page = await browser.newPage({viewport:{width:1200,height:800}})
    page.on('pageerror',error=>errors.push(error.message))
    if (noGPU) await page.addInitScript(() => {
      Object.defineProperty(navigator,'gpu',{value:undefined})
      const old = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function(type,...args) {
        return ['webgl2','webgpu'].includes(type) ? null : old.call(this,type,...args)
      }
    })
    await page.goto(base+'/?preset='+slug)
    await page.getByRole('button',{name:/Layout/}).click()
    await page.getByRole('button',{name:/Everything in one tile/}).click()
    await page.waitForFunction(()=>jigHost.program?.ok && !jigHost.compiling,null,{timeout:90000})
    await page.getByRole('button',{name:'Render…',exact:true}).click()
    const panel = page.getByRole('dialog',{name:'Render CAD Stage'})
    await panel.getByLabel('Width').fill('192')
    await panel.getByLabel('Height').fill('128')
    return {page, panel, style:panel.getByLabel('Render style')}
  }
  async function ready(page,panel) {
    await page.waitForFunction(()=>{
      const panel = document.querySelector('.stage-render')
      return !panel.querySelector('footer button').disabled || panel.querySelector('[role=alert]')
    },null,{timeout:120000})
    const error = panel.getByRole('alert')
    if (await error.count()) throw Error(await error.textContent())
  }
  try {
    {
      const {page,panel,style}=await open('A-01-box',true)
      assert.equal(await panel.getByRole('button',{name:'Render video'}).count(),0)
      await style.selectOption('PBR')
      const alert = panel.getByRole('alert')
      await alert.waitFor({timeout:90000})
      assert.match(await alert.textContent(),/WebGPU|WebGL/)
      assert.ok(await panel.getByRole('button',{name:'Save PNG'}).isDisabled())
      await style.selectOption('CAD lines')
      await ready(page,panel)
      await page.close()
      console.log('Unavailable GPU: visible error; CAD PNG recovery verified.')
    }
    {
      const {page,panel,style} = await open('A-01-box')
      await ready(page,panel)
      const image = () => panel.locator('canvas').evaluate(c=>c.toDataURL())
      const cad = await image()
      await style.selectOption('PBR')
      await ready(page,panel)
      const pbr = await image()
      assert.notEqual(pbr,cad)
      await style.selectOption('PBR + CAD edges')
      await panel.getByLabel(/Samples per pixel/).selectOption('64')
      await style.selectOption('CAD lines')
      await ready(page,panel)
      assert.equal(await image(),cad)
      await page.waitForTimeout(300)
      assert.equal(await image(),cad)
      await page.close()
      console.log('Static single-part PBR and rapid switch to CAD verified.')
    }
    {
      const {page,panel,style} = await open('SG-09-exploded-head')
      let downloads = 0
      page.on('download',()=>downloads++)
      await style.selectOption('PBR')
      await ready(page,panel)
      await panel.getByRole('button',{name:'Render video',exact:true}).click()
      await panel.getByRole('button',{name:'Cancel render'}).click()
      await panel.getByRole('button',{name:'Cancel render'}).waitFor({state:'hidden'})
      assert.equal(await panel.getByRole('alert').count(),0)
      assert.equal(downloads,0)
      await panel.getByRole('button',{name:'Render video',exact:true}).click()
      await panel.getByRole('button',{name:'Close',exact:true}).click()
      await page.getByRole('button',{name:'Render…',exact:true}).click()
      await ready(page,panel)
      assert.equal(downloads,0)
      await page.close()
      console.log('Video cancellation, dialog close and immediate reopen verified.')
    }
    assert.deepEqual(errors,[])
  } finally { await browser.close() }
}
main().catch(error=>{ console.error(error); process.exitCode=1 })
