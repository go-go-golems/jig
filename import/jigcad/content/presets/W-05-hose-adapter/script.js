// W-05 · Hose adapter: joins a 1/2" hose to a 3/8" one, with three barbs on
// each end and a collar between them, revolved from one half-section.
// Notice the barbs: the lower ones have flat backs that face up, the upper
// ones backs at 50°, so the whole adapter prints upright without support.
const BARBS = 3          // barbs on each end (the profile's shape, not a size)

// The half-section on XZ (x is the radius, z the axis), drawn with a loop:
// up the outside from the lower tip, then down the bore.
const pts = [['bore_a', 0], ['tip_a', 0]]
for (let k = 0; k < BARBS; k++) {
  // lower barb: a ramp out to the crest, then a flat back (facing up)
  pts.push(['crest_a', `${k + 1} * pitch`], ['tip_a', `${k + 1} * pitch`])
}
pts.pop()                                            // the last back ...
pts.push(['collar', 'z_c0'], ['collar', 'z_c1'])     // ... becomes the collar
for (let k = 0; k < BARBS; k++) {
  // upper barb: a steep back out to the crest, then a ramp in to the next tip
  pts.push(['tip_b', `z_c1 + ${k} * pitch`],
    ['crest_b', `z_c1 + ${k} * pitch + steep * (crest_b - tip_b)`])
}
pts.push(['tip_b', 'z_top'], ['bore_b', 'z_top'],
  ['bore_b', 'z_c1'], ['bore_a', 'z_c1 - steep * (bore_a - bore_b)'])

const adapter = j.part('hose-adapter')
  .params({
    d_a: mm(12.7),         // lower hose, inside diameter: 1/2 in
    d_b: mm(9.5),          // upper hose, inside diameter: 3/8 in
    pitch: mm(6),          // length of one barb
    wall: mm(1.6),         // under the tips of the barbs
    tip_a: 'd_a / 2 - 0.6 mm',   // the tips go into the hose freely ...
    crest_a: 'd_a / 2 + 0.9 mm', // ... the crests stretch it
    tip_b: 'd_b / 2 - 0.6 mm',
    crest_b: 'd_b / 2 + 0.9 mm',
    bore_a: 'tip_a - wall',
    bore_b: 'tip_b - wall',
    collar: 'max(crest_a, crest_b) + 3 mm',
    collar_h: mm(5),
    // every face that looks down rises 1.2 for 1 across: 50° from the bed,
    // a little steeper than the 45° limit
    steep: 1.2,
    // the collar starts at the last crest, with a steep underside
    z_c0: `${BARBS} * pitch + steep * (collar - crest_a)`,
    z_c1: 'z_c0 + collar_h',
    z_top: `z_c1 + ${BARBS} * pitch`,
  })
  .expose(['d_a', 'd_b', 'pitch', 'wall'], {
    labels: {
      d_a: 'lower hose inside diameter', d_b: 'upper hose inside diameter',
      pitch: 'barb length', wall: 'wall under the barbs',
    },
    ranges: {
      d_a: [mm(4), mm(25)], d_b: [mm(4), mm(25)], pitch: [mm(3), mm(10)],
      wall: [mm(1.2), mm(3)],
    },
  })
  .revolve(j.sketch('section', { on: j.plane.XZ })
    .polyline('p', pts, { closed: true }).profiles(),
  j.axis.Z, turn(1), { id: 'body' })

// Upright, the 1/2" end on the bed: every face is vertical, faces up, or
// slopes at 50°, so it needs no support. Its foot is a 50 mm² ring, under
// the fdm rules' 100 mm² for a first layer: the job asks for a 5 mm brim
// and lowers that rule's limit to 40 mm², which a brim makes safe.
const rules = j.rules('hose-adapter',
  [j.rules.fdm, j.rule.firstLayer({ minArea: 40 })])
return j.print('hose-adapter', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [adapter],
}).orient('+Z').brim({ width: mm(5) }).use(rules)
