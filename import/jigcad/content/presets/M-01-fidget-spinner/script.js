// M-01 · Fidget spinner: four 608 bearings, one to spin on, three as weights.
// Notice that the pockets are fit-aware press holes and the outline is three
// copies of one lobe and one arm, rounded where they meet.

// 608 skateboard bearing (ISO 15): bore 8 mm, outside Ø22 mm, 7 mm wide.
const bearing = { D: mm(22), B: mm(7), bore: mm(8) }

const spinner = j.part('spinner')
  .params({
    D: bearing.D,      // bearing outside diameter
    t: bearing.B,      // body thickness: flush with the bearing
    rim: mm(3),        // plastic round every pocket
    web: mm(5),        // plastic between the hub and a lobe pocket
    R: 'D + web',      // hub centre to lobe centre
    arm: mm(16),       // arm width
    round: mm(4),      // fillet where an arm meets a disc (4.1 mm at most)
  })
  .expose(['R', 'rim', 'arm', 'round'], {
    labels: { R: 'hub to lobe centres', rim: 'rim round each pocket',
      arm: 'arm width', round: 'inside rounding' },
    ranges: { R: [mm(25), mm(40)], rim: [mm(2), mm(6)], arm: [mm(14), mm(26)],
      round: [mm(1), mm(4)] },
  })
  .extrude(j.sketch('hub', { on: j.plane.XY })
    .circle('disc', 'D / 2 + rim').profiles(), 't', { id: 'hub' })
  .extrude(j.sketch('lobe', { on: j.plane.XY })
    .circle('disc', 'D / 2 + rim', { at: ['R', 0] }).profiles(), 't',
  { id: 'lobe' })
  .extrude(j.sketch('arm', { on: j.plane.XY })
    .rect('bar', 'R', 'arm', { at: [0, '-arm / 2'] }).profiles(), 't',
  { id: 'arm' })
  // three of each, 120° apart
  .pattern(j.feat('lobe'), j.pattern.circular(j.axis.Z, { count: 3 }),
    { id: 'lobes' })
  .pattern(j.feat('arm'), j.pattern.circular(j.axis.Z, { count: 3 }),
    { id: 'arms' })
  // round the six inside corners where arms meet discs
  .fillet(j.sel.edges('|Z').where(e => e.concave), 'round', { id: 'waist' })
  // a press fit for the bearing in every pocket: 22 mm + 2 × press gap +
  // hole compensation
  .hole(j.sketch('pockets', { on: j.plane.offset(j.plane.XY, 't') })
    .point('hub', [0, 0])
    .point('l1', ['R', 0])
    .point('l2', ['R * cos(120°)', 'R * sin(120°)'])
    .point('l3', ['R * cos(240°)', 'R * sin(240°)']),
  j.hole.simple(j.fit.hole('D', 'press')), { id: 'pockets' })
  // 0.6 mm chamfers on every top and bottom edge: softer to hold, a lead-in
  // for the bearings, and no elephant's foot on the bed
  .chamfer(j.sel.edges('#Z'), mm(0.6), { id: 'edges' })

// A finger cap for each side of the hub bearing: a pad, a spacer that bears
// on the inner race only (so the pad clears the spinning body), and a stub
// pressed into the 8 mm bore. The stub is written as a number: j.fit.pin
// gives a diameter, and a circle wants a radius.
const cap = j.part('cap')
  .params({
    pad: mm(20), padT: mm(1.6),
    spacer: mm(10.5),  // inside the inner race land of a 608 (about 12 mm)
    lift: mm(0.8),     // gap between pad and body
    stub: mm(7.9),     // 8 mm bore − 2 × 0.05 mm, the press class
    stubL: mm(3),      // two caps meet short of each other in the 7 mm bore
  })
  .extrude(j.sketch('pad', { on: j.plane.XY }).circle('c', 'pad / 2')
    .profiles(), 'padT', { id: 'pad' })
  .extrude(j.sketch('spacer', { on: j.plane.offset(j.plane.XY, 'padT') })
    .circle('c', 'spacer / 2').profiles(), 'lift', { id: 'spacer' })
  .extrude(j.sketch('stub', {
    on: j.plane.offset(j.plane.XY, 'padT + lift'),
  }).circle('c', 'stub / 2').profiles(), 'stubL', { id: 'stub' })
  .chamfer(j.feat('stub').endFace().edges(), mm(0.4), { id: 'lead' })

// PETG: tougher than PLA for a press fit that gets pulled apart. The body
// lies flat; the caps stand on their pads.
return j.print('fidget-spinner', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [spinner],
}).add('cap', cap, { qty: 2 }).orient('+Z')
