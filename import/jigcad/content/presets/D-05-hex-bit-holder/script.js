// D-05 · Hex-bit holder: three stepped rows of hexagonal pockets for 1/4"
// screwdriver bits. Notice the pocket size: 6.35 mm across flats (ISO 1173
// E6.3 / 1/4" hex) plus a gap on each flat.
const ROWS = 3   // one cut per row: each row is sketched on its own step height

// YZ: sketch x is world +Y, sketch y is world +Z
const side = j.sketch('side', { on: j.plane.YZ })
  .polyline('p', [
    [0, 0], ['3 * row', 0],
    ['3 * row', 'h0 + 2 * rise'], ['2 * row', 'h0 + 2 * rise'],  // back step
    ['2 * row', 'h0 + rise'], ['row', 'h0 + rise'],              // middle step
    ['row', 'h0'], [0, 'h0'],                                    // front step
  ], { closed: true })

const rowOf = k => j.sketch(`row${k}`,
  { on: j.plane.offset(j.plane.XY, `h0 + ${k} * rise`) })
  .polygon('hex', 6, 'af / 2 + gap', {
    inscribed: false,
    at: ['-(per_row - 1) * pitch / 2', `row * ${k + 0.5}`],
  })
  .pattern(['hex'],
    j.pattern.linear(j.dir('+X'), { count: 'per_row', step: 'pitch' }))

let holder = j.part('hex-bit-holder')
  .params({
    af: mm(6.35),          // 1/4 in across flats
    gap: mm(0.15),         // per flat: between the snug (0.10) and slide (0.20)
                           // classes, so bits hold but pull out by hand
    per_row: 10,
    web: lw(5),            // 2.25 mm between pockets at the corners
    // corners point along the row: across-corners plus web
    pitch: 'af / cos(30 deg) + 2 * gap + web',
    row: mm(14),           // depth of one step
    depth: mm(12),         // pocket depth: half of a 25 mm insert bit
    h0: 'depth + 1.6 mm',  // front step height: the pocket plus a 1.6 mm floor
    rise: mm(8),           // each row stands 8 mm higher than the one in front
    w: 'per_row * pitch + 6 mm',
  })
  .expose(['per_row', 'gap', 'depth', 'rise'], {
    labels: {
      per_row: 'bits per row', gap: 'gap on each flat',
      depth: 'pocket depth', rise: 'step height',
    },
    ranges: {
      per_row: [3, 16], gap: [mm(0.05), mm(0.3)],
      depth: [mm(6), mm(20)], rise: [mm(0), mm(15)],
    },
  })
  .extrude(side.profiles(), { symmetric: 'w' }, { id: 'body' })
// negative extent: down, against the +Z normal of each row's plane
for (let k = 0; k < ROWS; k++) {
  holder = holder.cut(rowOf(k).profiles(), '-depth', { id: `row${k + 1}` })
}
// The bed edges are the loop of the bottom face, which is the profile's
// first segment `p.1`. (startFace() would be the −X end: the extrude runs
// along X.)
const bed = j.feat('body').sideFace('p.1').edges()
holder = holder.chamfer(bed, mm(0.5), { id: 'foot' })

return j.print('hex-bit-holder', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [holder],
}).orient('+Z')
