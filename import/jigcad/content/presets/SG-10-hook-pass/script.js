const singer = await importPartFile('singer.parts.js')
const hook = await importPartFile('hook.parts.js')
const study = hook.setup(singer)
return study.assembly().study('Hook pass', {
  phase:'Shaft', from:deg(study.pass-25), to:deg(study.pass+25), steps:120,
  at:study.at,
  shot:[
    {time:0,surface:0.55,edges:0.9,annotations:0,
      section:{components:['plate','bobbinCase','bobbin'], normal:[1,0,0],
        offset:25, endOffset:0, endTime:1.2}},
    {time:1.3,accent:{components:['holder'],color:'#b28d4a'}},
    {time:2.7,accent:null},
  ],
})
