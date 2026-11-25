const presser = await importPartFile('presser.parts.js')
const parts = await importPartFile('singer.parts.js')
// Shaft angle from centered bottom dead center, degrees.
const phase = 0
// Lateral gate amplitude, degrees. Zero selects a centered straight stitch.
const amplitude = 2
const law = parts.flowLaw(amplitude)
const head = parts.assemble('upper head', phase, law.angle(phase))
return presser.mount(head, 0)
  .study('Stitch cycle', {
    phase: 'Shaft', from: deg(0), to: deg(720), steps: 144,
    at: a => parts.jointValues('upper head', a, law.angle(a)),
  })
