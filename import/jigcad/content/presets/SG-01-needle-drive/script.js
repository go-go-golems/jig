const parts = await importPartFile('singer.parts.js')
// Shaft angle from centered bottom dead center, degrees.
const phase = 60
// Lateral gate amplitude, degrees. Zero selects a centered straight stitch.
const amplitude = 0
return parts.assemble('drive', phase, parts.swingAt(phase, amplitude))
