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
    // The render shot is in presentation seconds, including the 7 s spread and return.
    // surface blends paper (0) to PBR (1). Edges and annotations have independent opacity.
    shot: [
      { time: 0, surface: 1, edges: 0, annotations: 0 },
      { time: 3, surface: 0, edges: 1, annotations: 1 },
      { time: 4, surface: 0, edges: 1, annotations: 1 },
      { time: 7, surface: 1, edges: 0.45, annotations: 0 },
      { time: 8, isolate: ['presserGuide', 'presserBar', 'presserShank', 'presserFoot'],
        section: { components: ['presserGuide'], normal: [0, -1, 0], offset: 0 } },
      { time: 9.75, annotations: 0 },
      { time: 10, isolate: null, section: null, annotations: 1,
        accent: { components: ['crank', 'rod', 'bar'], color: '#267a92' },
        trail: { component: 'needle', point: [0, 0, -17], seconds: 1.5, color: '#d95520' } },
      { time: 12.5, annotations: 1 },
      { time: 12.75, accent: null, trail: null, annotations: 0 },
      { time: 13, surface: 1, edges: 0 },
    ],
    at: a => parts.jointValues('upper head', a, law.angle(a)),
  })
