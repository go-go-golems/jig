const parts = await importPartFile('singer.parts.js')
// Shaft angle from centered bottom dead center, degrees.
const phase = 55
// Lateral gate amplitude, degrees. Zero selects a centered straight stitch.
const amplitude = 2
return parts.assemble('upper head', phase, parts.swingAt(phase, amplitude))
  .study('Stitch cycle', {
    phase: 'Shaft', from: deg(0), to: deg(720), steps: 144,
    at: a => parts.jointValues('upper head', a, parts.swingAt(a, amplitude)),
  })
