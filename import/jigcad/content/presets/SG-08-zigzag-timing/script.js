const parts = await importPartFile('singer.parts.js')
// Illustrative 6 mm lateral span measured at the plate surface.
const amplitude = Math.atan(3 / 73) * 180 / Math.PI
const law = parts.flowLaw(amplitude, 5)
// Leftmost needle on the rising stroke at the service reference height.
const phase = 360 + law.windows[1][0]
return parts.assemble('drive', phase, law.angle(phase))
  .study('Needle flow', {
    phase: 'Shaft', from: deg(0), to: deg(720), steps: 180,
    at: a => parts.jointValues('drive', a, law.angle(a)),
  })
