const parts = await importPartFile('singer.parts.js')
return parts.takeUpStudy(55)
  .study('Take-up cycle', {
    phase: 'Shaft', from: deg(0), to: deg(360), steps: 90,
    at: phase => parts.takeUpAngles(phase),
  })
