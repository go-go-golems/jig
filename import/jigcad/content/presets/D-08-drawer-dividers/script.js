// D-08 · Drawer divider set: egg-crate dividers that slot together, laid out
// flat as one part with a body per divider, ready for one plate.
// Notice the half-lap joint: long dividers are slotted from the top, short
// ones from the bottom, each to half the height, so they cross flush.
// Every divider lies in the XY plane: its length along X, its height along Y.
const longs = j.sketch('long', { on: j.plane.XY })
  .rect('plate', 'W - 2 * clear', 'h', { center: true, at: [0, 'h / 2'] })
const longSlots = j.sketch('long-slots', { on: j.plane.XY })
  .rect('s', 't + 2 * gap', 'h / 2 + gap',
    { center: true, at: ['-W / 2 + W / nx', 'h - (h / 2 + gap) / 2'] })
  .pattern(['s'], j.pattern.linear(j.dir('+X'),
    { count: 'nx - 1', step: 'W / nx' }))

// the short dividers are laid out after the long ones, `row` apart
const shorts = j.sketch('short', { on: j.plane.XY })
  .rect('plate', 'D - 2 * clear', 'h', { center: true, at: [0, 'y0 + h / 2'] })
const shortSlots = j.sketch('short-slots', { on: j.plane.XY })
  .rect('s', 't + 2 * gap', 'h / 2 + gap',
    { center: true, at: ['-D / 2 + D / ny', 'y0 + (h / 2 + gap) / 2'] })
  .pattern(['s'], j.pattern.linear(j.dir('+X'),
    { count: 'ny - 1', step: 'D / ny' }))

// the two top corners of a divider whose foot is at y = base: edges along Z,
// above mid-height
const topCorners = (id, base) => j.feat(id).edges('|Z').where((e, ctx) =>
  e.center.y > (base ? ctx.p[base].value : 0) + ctx.p.h.value / 2)

const set = j.part('drawer-dividers')
  .params({
    W: mm(200),            // inside width of the drawer (X)
    D: mm(150),            // inside depth of the drawer (Y)
    h: mm(40),             // divider height: a little under the drawer's
    nx: 3, ny: 2,          // compartments across and deep
    t: lw(5),              // divider thickness: five 0.45 mm lines, 2.25 mm
    gap: mm(0.2),          // per side of a slot: the slide fit class
    clear: mm(1),          // each divider is this much short at each end
    row: 'h + 6 mm',       // spacing of the dividers on the plate
    y0: '(ny - 1) * row',  // where the short dividers start on the plate
    r: mm(4),              // rounding of the top corners
    lead: mm(0.6),         // 45° lead-in at the mouth of each slot
  })
  .expose(['W', 'D', 'h', 'nx', 'ny'], {
    labels: {
      W: 'drawer width inside', D: 'drawer depth inside',
      h: 'divider height', nx: 'compartments across',
      ny: 'compartments deep',
    },
    ranges: {
      W: [mm(60), mm(240)], D: [mm(60), mm(240)], h: [mm(15), mm(80)],
      nx: [2, 6], ny: [2, 5],
    },
  })
  // the first long divider: a plate t thick, rounded, slotted from the top
  .extrude(longs.profiles(), 't', { id: 'long' })
  .fillet(topCorners('long', null), 'r', { id: 'long-round' })
  .cut(longSlots.profiles(), 't', { id: 'long-slots' })
  // the first short divider, slotted from the bottom
  .extrude(shorts.profiles(), 't', { id: 'short' })
  .fillet(topCorners('short', 'y0'), 'r', { id: 'short-round' })
  .cut(shortSlots.profiles(), 't', { id: 'short-slots' })
  // a lead-in at every slot mouth: the convex edges along Z of the slots
  .chamfer(j.feat('long-slots').edges('|Z').where(e => e.convex)
    .or(j.feat('short-slots').edges('|Z').where(e => e.convex)),
  'lead', { id: 'lead-in' })
  // copies: ny − 1 long dividers and nx − 1 short ones, as separate bodies
  .pattern(j.feat('long').body(), j.pattern.linear(j.dir('+Y'),
    { count: 'ny - 1', step: 'row' }), { id: 'longs' })
  .pattern(j.feat('short').body(), j.pattern.linear(j.dir('+Y'),
    { count: 'nx - 1', step: 'row' }), { id: 'shorts' })

// Flat on the bed: each divider is a 2.25 mm plate, quick to print and flat.
return j.print('drawer-dividers', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'), parts: [set],
}).orient('+Z').use(j.rules.fdm)
