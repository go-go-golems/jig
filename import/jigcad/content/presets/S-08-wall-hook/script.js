// S-08 · Screw-on wall hook: a side profile, rounded, with two countersunk
// screw holes, printed on its side.
// Notice the holes: they run across the build direction, so the kernel
// makes them teardrops, and a chamfer on their mouths is the countersink.
const side = j.sketch('side', { on: j.plane.XZ })   // x out of the wall, z up
  .polyline('p', [
    [0, 0], ['reach', 0], ['reach', 'lip'],          // under the arm, the lip
    ['reach - tip', 'lip'], ['reach - tip', 'arm'],  // inside of the lip
    ['t', 'arm'], ['t', 'H'], [0, 'H'],              // top of the arm, plate
  ], { closed: true })

const hook = j.part('wall-hook')
  .params({
    H: mm(70),       // plate height
    w: mm(22),       // width along the wall
    t: mm(6),        // plate thickness: room for the countersink and 3 mm
    reach: mm(38),   // how far the hook stands off the wall
    arm: mm(9),      // arm thickness
    lip: mm(22),     // height of the lip that stops the coat sliding off
    tip: mm(7),      // lip thickness
    // countersink: an M4 or 4 mm wood screw head is 8–9 mm across; the
    // bore is 4.4 mm, so a 45° chamfer of 2.4 mm opens it to 9.2 mm
    sink: mm(2.4),
  })
  .expose(['H', 'reach', 'lip', 'w'], {
    labels: { H: 'plate height', reach: 'reach from the wall',
      lip: 'lip height', w: 'width' },
    ranges: { H: [mm(45), mm(120)], reach: [mm(20), mm(70)],
      lip: [mm(10), mm(40)], w: [mm(14), mm(40)] },
  })
  .extrude(side.profiles(), { symmetric: 'w' }, { id: 'body' })
  // the profile's corners are the edges along Y: the two inside corners
  // (where the loop rests, and where the arm meets the plate) take a large
  // radius for strength, every outside corner a small one
  .fillet(j.feat('body').edges('|Y').where(e => e.concave), 'arm / 2',
    { id: 'inside' })
  .fillet(j.feat('body').edges('|Y').where(e => e.convex), mm(2),
    { id: 'outside' })
  // drilled from the plate's front face into the wall
  .hole([j.pt('t', 0, 'H - 10 mm'), j.pt('t', 0, 'arm + 16 mm')],
    j.hole.clearance('M4', { fit: 'slide' }), { id: 'screws' })
  // the mouths of the holes on the front face, chamfered at 45°: the head
  // sits flush, so a coat cannot catch on it
  .chamfer(j.feat('body').sideFace('p.6').edges()
    .and(j.feat('screws').edges()), 'sink', { id: 'countersink' })

// On its side: every layer holds the whole profile, so the arm cannot
// split along a layer line under load.
return j.print('wall-hook', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [hook],
}).orient('+Y')
