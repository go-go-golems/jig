// H-11 · Shelf bracket: a wall leg, a shelf leg and a diagonal gusset, in
// one triangular frame printed on its side, with countersunk screw holes.
// Notice the inner triangle: its corners are solved from the gusset's
// width in expressions, so the frame keeps its proportions at any size.
const frame = j.sketch('frame', { on: j.plane.XZ })  // x out from the wall
  .polyline('outer', [
    [0, 0], [0, 'H'], ['D', 'H'], ['D', 'H - t'],   // wall leg, shelf leg
    ['t', 0],                                       // down the gusset
  ], { closed: true })
  // the window inside the frame: bounded by the wall leg, the shelf leg
  // and the gusset's inner face, which lies b from the outer one
  .polyline('inner', [
    ['t', 'b * hyp / (D - t)'], ['t', 'H - t'],
    ['D - b * hyp / (H - t)', 'H - t'],
  ], { closed: true })

// screw holes: two through the wall leg, two up through the shelf leg
const wallScrews = [j.pt('t', 0, 'H - 22 mm'), j.pt('t', 0, 'H / 3')]
const shelfScrews = [j.pt('D * 0.4', 0, 'H - t'), j.pt('D * 0.8', 0, 'H - t')]

const bracket = j.part('shelf-bracket')
  .params({
    D: mm(150),     // shelf depth
    H: mm(110),     // height down the wall
    w: mm(25),      // width
    t: mm(6),       // thickness of the wall and shelf legs
    b: mm(7),       // width of the gusset
    hyp: 'hypot(D - t, H - t)',   // length of the gusset's outer face
    r: mm(4),       // inside corner radius
    sink: mm(2.3),  // countersink: opens the 4.4 mm bore to a 9 mm head
  })
  .configs({
    S: { D: mm(100), H: mm(80), w: mm(20) },
    M: {},
    L: { D: mm(200), H: mm(150), w: mm(30), t: mm(8), b: mm(9) },
  })
  .config('M')
  .expose(['D', 'H', 'w', 'b'], {
    labels: { D: 'shelf depth', H: 'height on the wall', w: 'width',
      b: 'gusset width' },
    ranges: { D: [mm(80), mm(220)], H: [mm(60), mm(180)],
      w: [mm(15), mm(40)], b: [mm(4), mm(14)] },
  })
  .extrude(frame.profiles(), { symmetric: 'w' }, { id: 'body' })
  // the window's three corners are the concave edges along Y
  .fillet(j.feat('body').edges('|Y').where(e => e.concave), 'r',
    { id: 'inside' })
  // ISO 273 medium clearance for 4 mm screws, from the slide fit class;
  // drilled from the inside faces, where the screwdriver reaches
  .hole(wallScrews, j.hole.clearance('M4', { fit: 'slide' }),
    { id: 'wall' })
  .hole(shelfScrews, j.hole.clearance('M4', { fit: 'slide' }),
    { id: 'shelf' })
  // the holes' mouths on the inside faces, chamfered into countersinks
  .chamfer(j.feat('body').sideFace('inner.1').edges()
    .and(j.feat('wall').edges())
    .or(j.feat('body').sideFace('inner.2').edges()
      .and(j.feat('shelf').edges())), 'sink', { id: 'countersink' })

// On its side, so every layer is the whole triangle and the gusset cannot
// split from the legs. The holes are teardrops with countersunk mouths.
return j.print('shelf-bracket', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [bracket],
}).orient('+Y')
