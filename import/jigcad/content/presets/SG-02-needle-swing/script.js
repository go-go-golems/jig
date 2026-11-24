const parts = await importPartFile('singer.parts.js')
// Shaft angle from centered bottom dead center, degrees.
const phase = 0
// Lateral gate amplitude, degrees. Zero selects a centered straight stitch.
const amplitude = 2
return parts.assemble('swing', phase, parts.swingAt(phase, amplitude))
