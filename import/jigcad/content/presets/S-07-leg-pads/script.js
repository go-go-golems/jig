// S-07 · Furniture leg pads: a tapered cup for a round chair leg, four on
// a plate. Notice the configs: S, M and L are three rows of sizes, and the
// print job asks for four of whichever one is active.
const pad = j.part('leg-pad')
  .params({
    leg: mm(28),         // leg diameter: measure the foot with calipers
    depth: mm(8),        // how far the leg sits in the cup
    floor: layer(10),    // 2 mm of material between the leg and the floor
    wall: lw(5),         // 2.25 mm round the leg at the rim
    taper: deg(12),      // the outside leans in, so the foot is wider
    h: 'depth + floor',
    // the outside at the top is leg + 2 · wall; the taper widens the base
    base_d: 'leg + 2 * wall + 2 * h * tan(taper)',
  })
  // S: bar stool or side table; M: dining chair; L: table or sofa leg
  .configs({
    S: { leg: mm(20), depth: mm(6) },
    M: { leg: mm(28) },
    L: { leg: mm(40), depth: mm(10), wall: lw(6) },
  })
  .config('M')
  .expose(['leg', 'depth', 'taper'], {
    labels: { leg: 'leg diameter', depth: 'cup depth', taper: 'side taper' },
    ranges: { leg: [mm(12), mm(60)], depth: [mm(3), mm(20)],
      taper: [deg(0), deg(30)] },
  })
  // a positive taper flares outward as it rises, so this one is negative
  .extrude(j.region.circle('base_d / 2'), 'h', { taper: '-taper', id: 'body' })
  // the leg's pocket is a blind hole sized by the snug fit class: the cup
  // stays on when the chair is lifted, but goes on by hand
  .hole([[0, 0]], j.hole.simple(j.fit.hole('leg', 'snug'), 'depth'),
    { id: 'pocket' })
  // both edges of the rim: the outside, and the pocket's mouth, which
  // becomes a lead-in for the leg
  .fillet(j.feat('body').endFace().edges(), mm(1), { id: 'rim' })
  // a bed edge gets a chamfer, not a fillet: no overhang, no elephant's foot
  .chamfer(j.feat('body').startFace().edges(), mm(0.6), { id: 'foot' })

// TPU grips the floor and does not scratch it. Printed open side up, four
// at a time.
return j.print('leg-pads', {
  printer: j.printer('generic-fdm'), material: j.material('TPU-95A'),
}).add('pad', pad, { qty: 4 }).orient('+Z')
