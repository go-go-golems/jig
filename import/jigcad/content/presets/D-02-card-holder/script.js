// D-02 · Business-card holder: one side profile, extruded to width,
// with a thumb notch in the front lip.
// Notice that every point of the profile is an expression of the params,
// so the lean and the stack depth move the back wall.
// Card sizes: EU 85 × 55 mm, US 3.5 × 2 in (88.9 × 50.8 mm),
// ISO 7810 ID-1 85.6 × 54 mm.
const side = j.sketch('side', { on: j.plane.XZ })
  .polyline('p', [
    [0, 0],
    ['2 * t + stack', 0],                              // outer foot of the back
    ['2 * t + stack + back_h * tan(lean)', 'back_h'],  // back leans by `lean`
    ['t + stack + (back_h - t) * tan(lean)', 'back_h'],
    ['t + stack', 't'],                                // inner foot of the back
    ['t', 't'],                                        // floor
    ['t', 'lip'], [0, 'lip'],                          // front lip
  ], { closed: true })

const holder = j.part('card-holder')
  .params({
    card_w: mm(85),        // long edge of the card (EU); 88.9 mm for US cards
    stack: mm(22),         // room for about 50 cards at 0.35 mm, plus a hand
    lean: deg(15),         // the back leans this far from vertical
    back_h: mm(40),        // back height: about 3/4 of the 55 mm card height
    lip: mm(12),           // front lip height
    t: mm(3),              // wall and floor thickness
    w: 'card_w - 20 mm',   // narrower than a card, so cards stick out 10 mm
                           // each side to pick up
    notch: mm(12),         // thumb notch radius
  })
  .expose(['card_w', 'stack', 'lean', 'back_h'], {
    labels: {
      card_w: 'card length', stack: 'stack depth',
      lean: 'lean of the back', back_h: 'back height',
    },
    ranges: {
      card_w: [mm(50), mm(100)], stack: [mm(8), mm(40)],
      lean: [deg(0), deg(30)], back_h: [mm(20), mm(60)],
    },
  })
  .extrude(side.profiles(), { symmetric: 'w' }, { id: 'body' })
  // the notch is cut through the lip only:
  // a circle on a plane just in front of it, cut back by t + 2 mm
  .cut(j.sketch('thumb', { on: j.plane.offset(j.plane.YZ, mm(-1)) })
    .circle('c', 'notch', { at: [0, 'lip + 4 mm'] })
    .profiles(),
    't + 2 mm', { id: 'notch' })
  .chamfer(j.feat('body').edges().where(e => e.center.z < 1e-6), mm(0.5),
    { id: 'foot' })

// Upright, floor on the bed: the back leans 15°, well inside the 45° limit,
// so nothing needs support.
return j.print('card-holder', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [holder],
}).orient('+Z')
