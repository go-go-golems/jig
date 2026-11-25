// Run after make web and script 02. BASE_URL [PLAYWRIGHT_MODULE] [CHROMIUM_EXECUTABLE].
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {execFileSync}=require('node:child_process')
const assert=require('node:assert/strict')
const {chromium}=require(process.argv[3]||'playwright')
const sources=path.resolve(__dirname,'../sources')
const receipt=JSON.parse(fs.readFileSync(path.join(sources,'hook-pass.json')))
async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sg10-movie-'))
  const browser=await chromium.launch({executablePath:process.argv[4],args:['--enable-unsafe-webgpu','--enable-features=Vulkan',
    '--use-angle=vulkan','--use-vulkan','--ignore-gpu-blocklist']})
  try {
    const page=await browser.newPage({viewport:{width:1450,height:920},acceptDownloads:true})
    page.on('pageerror',console.error)
    await page.goto(process.argv[2]+'/?preset=SG-10-hook-pass')
    await page.getByRole('button',{name:/Layout/}).click()
    await page.getByRole('button',{name:/Everything in one tile/}).click()
    await page.getByRole('slider',{name:'Study sample'}).waitFor({timeout:120000})
    await page.getByRole('button',{name:'Axo',exact:true}).click()
    await page.getByRole('slider',{name:'Study sample'}).fill(String(receipt.row))
    // Observe the camera handed to the actual color renderer for annotation.
    await page.evaluate(()=>{
      const stage=document.querySelector('.sheethost').jigStage
      const original=stage.renderCamera
      stage.renderCamera=function(study){
        const draw=original.call(this,study)
        return (canvas,opts,beauty)=>draw(canvas,opts,beauty && (args=>{
          window.inspectionCamera=args.camera
          return beauty(args)
        }))
      }
    })
    await page.getByRole('button',{name:'Render…',exact:true}).click()
    const panel=page.getByRole('dialog',{name:'Render CAD Stage'})
    const ready=async()=>{
      await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))))
      await page.waitForFunction(()=>{
        const d=document.querySelector('.stage-render')
        return d.querySelector('[role=alert]') || !d.querySelector('footer button').disabled
      },undefined,{timeout:180000})
      if(await panel.getByRole('alert').count()) throw Error(await panel.getByRole('alert').textContent())
    }
    await panel.getByLabel('Width').fill('960')
    await panel.getByLabel('Height').fill('600')
    await panel.getByLabel('Zoom').fill('1.55')
    await panel.getByLabel('Render style').selectOption('Preset animation')
    await panel.getByLabel(/Samples per pixel/).selectOption('4')
    await panel.getByLabel('Study frame').fill(String(receipt.row))
    await ready()
    await page.screenshot({path:path.join(sources,'sg10-workbench.png')})
    const labeled=await panel.locator('canvas').evaluate((canvas,r)=>{
      const c=window.inspectionCamera
      const delta=r.hookPointWorldMm.map((q,k)=>q-c.T[k])
      const dot=v=>v.reduce((sum,x,k)=>sum+x*delta[k],0)
      const x=c.W/2+c.s*dot(c.r), y=c.Y0-c.s*dot(c.u)
      const frame=document.createElement('canvas')
      frame.width=canvas.width; frame.height=canvas.height
      const ctx=frame.getContext('2d')
      ctx.drawImage(canvas,0,0)
      ctx.strokeStyle='#f0c965'; ctx.lineWidth=2
      ctx.beginPath(); ctx.arc(x,y,10,0,2*Math.PI); ctx.stroke()
      ctx.beginPath();ctx.moveTo(x+10,y);ctx.lineTo(x+40,y-35);ctx.lineTo(x+112,y-35);ctx.stroke()
      ctx.font='bold 14px sans-serif'
      ctx.fillStyle='#1b2731';ctx.fillRect(x+37,y-59,145,23)
      ctx.fillStyle='#fff1cb';ctx.fillText('Hook at needle scarf',x+42,y-43)
      ctx.fillStyle='#18242e';ctx.fillRect(0,frame.height-76,frame.width,76)
      ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif'
      ctx.fillText('SG-10    Rotary hook at the right-rising needle',18,frame.height-50)
      ctx.font='15px sans-serif'
      ctx.fillText('Shaft '+r.shaftDeg.toFixed(2)+'°  (model)     Bar rise '+r.barRiseMm.toFixed(2)+' mm  (§3-11)     Scarf gap '+r.rearScarfGapMm.toFixed(3)+' mm  (chosen §3-12 midpoint)',18,frame.height-22)
      return {png:frame.toDataURL().split(',')[1],point:[x,y]}
    },receipt)
    const png=path.join(sources,'sg10-hook-pass.png')
    fs.writeFileSync(png,Buffer.from(labeled.png,'base64'))
    console.log('Saved inspection image; projected hook tip',labeled.point)
    const dl=page.waitForEvent('download',{timeout:600000})
    await panel.getByRole('button',{name:'Render video'}).click()
    const movie=await Promise.race([dl,panel.getByRole('alert').waitFor({timeout:600000}).then(async()=>{
      throw Error(await panel.getByRole('alert').textContent())
    })])
    const raw=path.join(temp,movie.suggestedFilename())
    await movie.saveAs(raw)
    // The workbench exports 96 samples. Insert an exact event hold between
    // the two adjacent movie samples that straddle the midpoint.
    const finished=path.join(sources,'sg10-hook-pass.mp4')
    execFileSync('ffmpeg',['-v','error','-y','-i',raw,'-loop','1','-framerate','24','-i',png,
      '-filter_complex','[0:v]split[a][b];[a]trim=end_frame=48,setpts=PTS-STARTPTS[start];[1:v]trim=end_frame=48,format=yuv420p,setpts=PTS-STARTPTS[hold];[b]trim=start_frame=48,setpts=PTS-STARTPTS[end];[start][hold][end]concat=n=3:v=1:a=0[out]',
      '-map','[out]','-r','24','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',finished])
    const stream=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',finished])).streams[0]
    assert.deepEqual([stream.width,stream.height,stream.avg_frame_rate,stream.nb_read_frames],[960,600,'24/1','144'])
    console.log('Verified 144 frames including 48-frame inspection hold.')
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
