// W-06 · Shelf bracket: an L-bracket with a gusset and countersunk screw
// holes, printed on its side so the bending load runs along the layers.
// Notice the gusset: it is flush with one side face, the one on the bed,
// because a gusset in the middle would float over nothing when printed.
// Side view on XZ: the wall is x = 0, the shelf's underside is z = 0; the
// leg runs down the wall, the arm out under the shelf.
const side = j.sketch('side', { on: j.plane.XZ })
  .polyline('p', [
    [0, 0], ['arm', 0], ['arm', '-t'],      // the arm, under the shelf
    ['t', '-t'], ['t', '-leg'], [0, '-leg'],   // the leg, down the wall
  ], { closed: true })
const gusset = j.sketch('gusset', { on: j.plane.XZ })
  .polyline('g', [
    ['t', '-t'], ['t + g_x', '-t'], ['t', '-t - g_z'],
  ], { closed: true })

const bracket = j.part('shelf-bracket')
  .params({
    leg: mm(100),          // down the wall
    arm: mm(120),          // under the shelf: about 2/3 of the shelf's depth
    t: mm(6),
    b: mm(25),             // width
    g_x: '0.6 * (arm - t)',   // the gusset runs 60 % of the way along each
    g_z: '0.6 * (leg - t)',
    g_t: mm(6),            // gusset thickness
    r: mm(6),              // inside corner
  })
  .expose(['leg', 'arm', 't', 'b'], {
    labels: { leg: 'leg on the wall', arm: 'arm under the shelf',
      t: 'thickness', b: 'width' },
    ranges: { leg: [mm(50), mm(150)], arm: [mm(50), mm(180)],
      t: [mm(4), mm(10)], b: [mm(15), mm(40)] },
  })
  .extrude(side.profiles(), 'b', { id: 'body' })
  // the inside corner, where the bending stress is highest
  .fillet(j.feat('body').edges('|Y').where(e => e.concave), 'r',
    { id: 'corner' })
  // the gusset starts at y = 0, the side face that will be on the bed
  .extrude(gusset.profiles(), 'g_t', { id: 'gusset' })
  // M4 countersunk wood screws: two into the wall beyond the gusset, heads
  // flush with the inside of the leg; two up into the shelf, heads flush
  // with the underside of the arm
  .hole([j.pt('t', '-b / 2', '-leg + 12 mm'),
    j.pt('t', '-b / 2', '-leg + 0.2 * (leg - t) + 12 mm')],
  j.hole.countersink('M4', { fit: 'free' }), { id: 'wall' })
  .hole([j.pt('arm - 12 mm', '-b / 2', '-t'),
    j.pt('arm - 0.2 * (arm - t) - 12 mm', '-b / 2', '-t')],
  j.hole.countersink('M4', { fit: 'free' }), { id: 'shelf' })

// On its side, −Y up: the sketch plane y = 0, with the gusset, lies on the
// bed (both extrudes run along −Y, the XZ plane's normal), so the corner
// bends within the layers; the four holes become teardrops.
return j.print('shelf-bracket', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [bracket],
}).orient('-Y').use(j.rules.fdm)
