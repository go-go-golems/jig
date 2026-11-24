const parts = await importPartFile('singer.parts.js')
// Shaft angle from centered bottom dead center, degrees.
const phase = 55
// Lateral gate amplitude, degrees. Zero selects a centered straight stitch.
const amplitude = 2
return parts.assemble('upper head', phase, parts.swingAt(phase, amplitude))
