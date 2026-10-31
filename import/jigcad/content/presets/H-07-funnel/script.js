// H-07 · Kitchen funnel: a revolved cone and spout, shelled open at both
// ends, with a flange and hanging tab at the rim and air ribs on the spout.
// Notice the shell: two open faces, one at each end, picked by the
// profile segments that swept them.
const section = j.sketch('section', { on: j.plane.XZ })  // x: radius, z: up
  .polyline('p', [
    [0, 0], ['top_d / 2', 0],                      // the rim, on the bed
    ['spout_d / 2', 'cone_h'],                     // up the cone
    ['spout_d / 2', 'cone_h + spout_l'],           // up the spout
    [0, 'cone_h + spout_l'],
  ], { closed: true })

// a flat ring round the rim, and a tab with a hole to hang the funnel by
const flange = j.region.circle('top_d / 2 + lip')
  .subtract(j.region.circle('top_d / 2 - wall'))
const tab = j.region
  .slot(['top_d / 2 + tab_w / 2 - 1 mm', 0], ['top_d / 2 + tab', 0], 'tab_w')
  .subtract(j.region.circle('hang_d / 2', { at: ['top_d / 2 + tab', 0] }))

// three air ribs down the outside of the spout, so air can leave a bottle
// while liquid goes in. They start 2 mm down inside the cone's wall, so
// no rib begins in mid-air.
const low = j.plane.offset(j.plane.XY, 'cone_h - 2 mm')
const ribs = j.sketch('ribs', { on: low })
  .rect('r', 'rib + 0.3 mm', 'rib_t',
    { at: ['spout_d / 2 - 0.3 mm', '-rib_t / 2'] })
  .pattern(['r'], j.pattern.circular(j.axis.Z, { count: 3 }))

const funnel = j.part('funnel')
  .params({
    top_d: mm(100),     // mouth diameter, outside
    spout_d: mm(14),    // spout diameter, outside: fits a 20 mm bottle neck
    cone_h: mm(60),     // the cone's sides lean out 35° from vertical
    spout_l: mm(35),
    wall: lw(4),        // 1.8 mm
    lip: mm(5),         // flange width round the rim
    flange_t: layer(8), // 1.6 mm
    tab: mm(16), tab_w: mm(14), hang_d: mm(6),   // the hanging tab
    rib: mm(1.2),       // the air ribs stand 1.2 mm off the spout
    rib_t: lw(3),
  })
  .configs({
    S: { top_d: mm(70), spout_d: mm(10), cone_h: mm(42), spout_l: mm(25) },
    M: {},
    L: { top_d: mm(140), spout_d: mm(24), cone_h: mm(80), spout_l: mm(40) },
  })
  .config('M')
  .expose(['top_d', 'spout_d', 'cone_h', 'spout_l'], {
    labels: { top_d: 'mouth diameter', spout_d: 'spout diameter',
      cone_h: 'cone height', spout_l: 'spout length' },
    ranges: { top_d: [mm(50), mm(180)], spout_d: [mm(8), mm(40)],
      cone_h: [mm(30), mm(120)], spout_l: [mm(10), mm(80)] },
  })
  .revolve(section.profiles(), j.axis.Z, turn(1), { id: 'body' })
  .shell(j.feat('body').sideFace('p.1').or(j.feat('body').sideFace('p.4')),
    'wall', { id: 'hollow' })
  .extrude(flange, 'flange_t', { id: 'flange' })
  .extrude(tab, 'flange_t', { id: 'tab' })
  .extrude(ribs.profiles(), 'spout_l + 2 mm', { id: 'ribs' })

// Mouth down: the cone narrows as it rises, so nothing overhangs, and the
// flange gives the first layer a wide ring to hold on to.
return j.print('funnel', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [funnel],
}).orient('+Z')
