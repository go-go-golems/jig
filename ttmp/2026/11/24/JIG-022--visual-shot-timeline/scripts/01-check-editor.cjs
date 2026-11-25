// node <script> BASE_URL [PLAYWRIGHT_MODULE]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.argv[3] || 'playwright');
async function main() {
  const browser = await chromium.launch({executablePath:process.argv[4],args:['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan','--ignore-gpu-blocklist']});
  try {
    const page = await browser.newPage({viewport:{width:1500,height:1000}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(new URL('/?preset=SG-09-exploded-head',process.argv[2]).href);
    await page.getByRole('button',{name:/Layout/}).click();
    await page.getByRole('button',{name:/Everything in one tile/}).click();
    await page.getByRole('checkbox',{name:'Loop'}).waitFor({timeout:90000});
    const cameras = page.getByRole('button',{name:'Saved cameras'});
    await page.evaluate(()=>{
      const stage=document.querySelector('.sheethost').jigStage;
      stage.setView({name:'axo',yaw:0.23,pitch:-0.09,pan:[12,-4],zoom:2.4});
      stage.redraw();
    });
    await cameras.click();
    await page.getByLabel('Camera name').fill('Inspection');
    await page.getByRole('button',{name:'Save camera',exact:true}).click();
    const saved = await page.evaluate(()=>JSON.parse(jigHost.files.get('cameras.json')).Inspection);
    await cameras.click();
    await page.getByRole('button',{name:'Side',exact:true}).click();
    await cameras.click();
    await page.getByRole('button',{name:'Inspection',exact:true}).click();
    const recalled = await page.evaluate(()=>document.querySelector('.sheethost').jigStage._state().cam);
    assert.ok(Math.abs(recalled.yaw-saved.yaw)<1e-8);
    assert.ok(Math.abs(recalled.H/recalled.s-saved.height)<1e-8);
    assert.deepEqual(recalled.T,saved.target);
    const zoom=page.getByRole('slider',{name:'Zoom',exact:true});
    assert.ok(Math.abs(Number(await zoom.inputValue())-2.4)<1e-6);
    await zoom.fill('2.45');
    const adjusted=await page.evaluate(()=>document.querySelector('.sheethost').jigStage._state().cam.s);
    assert.ok(Math.abs(adjusted/recalled.s-2.45/2.4)<1e-6);
    await page.getByRole('button',{name:'Render…',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Render CAD Stage'});
    await dialog.getByLabel('Width').fill('640');
    await dialog.getByLabel('Height').fill('360');
    await dialog.getByText('Shot timeline',{exact:true}).click();
    const mark=dialog.getByRole('button',{name:'Shot key at 3 seconds',exact:true});
    await mark.focus(); await mark.press('Enter');
    const input=dialog.getByLabel('Key time (s)');
    await input.fill('0'); await input.press('Tab');
    await dialog.getByText(/strictly increasing/).waitFor();
    await input.fill('2.5'); await input.press('Tab');
    await dialog.getByLabel('Camera cut').selectOption('Inspection');
    await dialog.getByRole('button',{name:'Save timeline'}).click();
    const read = ()=>page.evaluate(()=>JSON.parse(jigHost.files.get('shots.json'))['Stitch cycle']);
    const keys=await read();
    assert.equal(keys[1].time,2.5); assert.equal(keys[1].view.camera,'Inspection');
    const marker=dialog.getByRole('button',{name:'Shot key at 2.5 seconds',exact:true});
    const box=await marker.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down(); await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2,{steps:4}); await page.mouse.up();
    await dialog.getByRole('button',{name:'Save timeline'}).click();
    assert.ok((await read())[1].time > 2.5);
    const save=dialog.getByRole('button',{name:'Save PNG'});
    await save.waitFor();
    await page.waitForFunction(()=>!document.querySelector('.stage-render footer button').disabled);
    const dest=path.join(__dirname,'../sources/timeline-camera.png');
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    await dialog.screenshot({path:dest});
    await dialog.getByText(/^Work area ·/).click();
    await dialog.getByLabel('First output frame').fill('80');
    await dialog.getByLabel('Last output frame').fill('82');
    await dialog.getByRole('button',{name:'Play work area'}).click();
    await page.waitForFunction(()=>
      [...document.querySelectorAll('.stage-render button')].some(b=>b.textContent==='Play work area') &&
      [...document.querySelectorAll('.stage-render label')].find(l=>l.textContent.startsWith('Study frame')).querySelector('input').value==='82');
    await page.reload();
    await page.waitForFunction(()=>jigHost.program?.ok && jigHost.files.has('shots.json'));
    assert.ok((await read())[1].time>2.5);
    await page.getByRole('button',{name:'Render…'}).click();
    const restored=page.getByRole('dialog',{name:'Render CAD Stage'});
    await restored.getByText('Shot timeline',{exact:true}).click();
    await restored.getByRole('button',{name:'Restore authored keys'}).click();
    assert.equal(await read(),undefined);
    await restored.getByRole('button',{name:'Shot key at 3 seconds',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('Registered and recalled camera; detected duplicate time; edited, dragged, saved and reloaded shot');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
