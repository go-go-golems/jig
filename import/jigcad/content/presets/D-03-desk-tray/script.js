// D-03 · Desk tray with compartments: a block minus a grid of pockets,
// with scooped floors, sized by a config.
// Notice that the tray is not built from walls: one cut removes every
// compartment, so the dividers are what is left.
const pockets = j.sketch('pockets', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('c', 'cw', 'cd', {
    center: true,
    at: ['-w / 2 + wall + cw / 2', '-d / 2 + wall + cd / 2'],
    r: 'r_in',
  })
  .pattern(['c'], j.pattern.grid(j.dir('+X'), j.dir('+Y'),
    { count: ['nx', 'ny'], step: ['cw + wall', 'cd + wall'] }))

const tray = j.part('desk-tray')
  .params({
    w: mm(160), d: mm(100), h: mm(30),   // outside size
    wall: lw(4),                          // outer walls and dividers:
                                          // four 0.45 mm lines = 1.8 mm
    floor: layer(8),                      // 1.6 mm floor
    nx: 3, ny: 2,                         // compartments across and deep
    r_in: mm(6),                          // corner radius of each compartment
    scoop: 'r_in',                        // floor fillet = corner radius:
                                          // spherical corners you can sweep
                                          // clips out of
    cw: '(w - (nx + 1) * wall) / nx',     // compartment width and depth
                                          // follow from the grid
    cd: '(d - (ny + 1) * wall) / ny',
  })
  // three layouts; with no config chosen the middle one is active
  .configs({
    pens: { nx: 4, ny: 1, d: mm(80) },
    mixed: { nx: 3, ny: 2 },
    parts: { nx: 4, ny: 3, h: mm(25) },
  })
  .expose(['w', 'd', 'h', 'nx', 'ny'], {
    labels: {
      w: 'outside width', d: 'outside depth',
      h: 'height',
      nx: 'compartments across', ny: 'compartments deep',
    },
    ranges: {
      w: [mm(60), mm(240)], d: [mm(40), mm(200)],
      h: [mm(15), mm(60)],
      nx: [1, 6], ny: [1, 5],
    },
  })
  .extrude(j.sketch('base', { on: j.plane.XY })
    .rect('r', 'w', 'd', { center: true, r: 'r_in + wall' })
    .profiles(),
    'h', { id: 'body' })
  .cut(pockets.profiles(), 'h - floor', { id: 'pocket' })
  // the floor edges of every pocket:
  // concave edges of `pocket` at the floor height
  .fillet(j.feat('pocket').edges()
    .where((e, ctx) =>
      e.concave && Math.abs(e.center.z - ctx.p.floor.value) < 1e-6),
    'scoop', { id: 'scoop' })
  .chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })

return j.print('desk-tray', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [tray],
}).orient('+Z')
