const parts = await importPartFile('singer.parts.js')
// The gate stays centered for this straight-stitch study.
return parts.assemble('drive', 60, 0)
  .study('Needle stroke', {
    phase: 'Shaft', from: deg(0), to: deg(360), steps: 72,
    at: phase => parts.jointValues('drive', phase, 0),
  })
