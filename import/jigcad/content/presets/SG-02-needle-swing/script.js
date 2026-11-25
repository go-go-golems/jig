const parts = await importPartFile('singer.parts.js')
const law = parts.flowLaw(2)
return parts.assemble('swing', 0, law.angle(0))
  .study('Gate and slide', {
    phase: 'Shaft', from: deg(0), to: deg(720), steps: 144,
    at: phase => parts.jointValues('swing', phase, law.angle(phase)),
  })
