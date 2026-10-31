// H-03 · Toothbrush holder: a square cup with four compartments, drained
// through the floor into channels underneath.
// Notice the dividers: a rib grows a wall from each sketched line down to
// the floor, so two lines make the cross.
const pocket = j.sketch('pocket', { on: j.plane.offset(j.plane.XY, 'H') })
  .rect('r', 'W - 2 * wall', 'W - 2 * wall', { center: true, r: 'r - wall' })

// the cross, drawn across the inside where the dividers stop, and grown
// down from there
const cross = j.sketch('cross', { on: j.plane.offset(j.plane.XY, 'H - drop') })
  .line('a', ['-W / 2 + wall', 0], ['W / 2 - wall', 0])
  .line('b', [0, '-W / 2 + wall'], [0, 'W / 2 - wall'])

// two tunnels under the floor along X, each through a pair of drain
// holes, with a 45° roof so they print without support
const tunnel = j.sketch('tunnel', { on: j.plane.YZ })
  .polyline('t', [['q - drain_d / 2', 0], ['q + drain_d / 2', 0],
    ['q + drain_d / 2', 'lift - drain_d / 2'], ['q', 'lift'],
    ['q - drain_d / 2', 'lift - drain_d / 2']], { closed: true })
  .mirror(['t'], 'Y')

const holder = j.part('toothbrush-holder')
  .params({
    W: mm(70),          // outside width: four 31 mm compartments
    H: mm(105),         // a brush is about 190 mm: half of it stands out
    r: mm(14),          // corner radius
    wall: lw(4),        // 1.8 mm
    lift: mm(4),        // height of the drain tunnels
    floor: 'lift + 2.4 mm',
    drop: mm(30),       // the dividers stop this far below the rim
    div: lw(3),         // divider thickness, 1.35 mm
    drain_d: mm(5),
    q: 'W / 4',         // compartment centres sit at ±q, ±q
  })
  .expose(['W', 'H', 'drop'], {
    labels: { W: 'width', H: 'height', drop: 'dividers below the rim' },
    ranges: { W: [mm(50), mm(100)], H: [mm(70), mm(140)],
      drop: [mm(10), mm(80)] },
  })
  .extrude(j.region.rect('W', 'W', { r: 'r' }), 'H', { id: 'body' })
  .chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })
  .cut(pocket.profiles(), 'H - floor', { id: 'cup' })
  .rib(cross.wire(['a', 'b']), 'div', { direction: '-Z', id: 'dividers' })
  // one drain hole in each compartment, from the inside floor straight
  // down
  .hole([['q', 'q'], ['-q', 'q'], ['q', '-q'], ['-q', '-q']]
    .map(([x, y]) => j.pt(x, y, 'floor')), j.hole.simple('drain_d'),
    { id: 'drain' })
  .cut(tunnel.profiles(), { symmetric: 'W + 2 mm' }, { id: 'tunnels' })
  // round every inside corner at the floor, walls and dividers alike, so
  // the compartments rinse clean
  .fillet(j.feat('cup').edges().where((e, ctx) => e.concave
    && Math.abs(e.center.z - ctx.p.floor.value) < 1e-6), mm(3),
    { id: 'scoop' })
  .fillet(j.feat('body').endFace().edges(), mm(0.8), { id: 'rim' })

return j.print('toothbrush-holder', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [holder],
}).orient('+Z')
