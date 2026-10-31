// S-04 · Plant label stake: three extrudes that join because they touch.
// Notice that nothing says "join": a solid feature that touches the body
// is fused into it, and the trace records that decision.
const paddle = j.sketch('paddle', { on: j.plane.XY })
  .rect('outline', 'W', 'P', { center: true, at: [0, 'P / 2'], r: 4 })

// overlaps the paddle by 1 mm so the two fuse
const spike = j.sketch('spike', { on: j.plane.XY })
  .polyline('outline', [
    ['-s / 2', '1 mm'], ['s / 2', '1 mm'],
    ['s / 2', 'tip - S'], [0, '-S'], ['-s / 2', 'tip - S'],
  ], { closed: true })

// a spine along the spike, so it does not fold in hard soil
const rib = j.sketch('rib', { on: j.feat('spike').endFace() })
  .rect('outline', 'rib_w', 'S - tip', { at: ['-rib_w / 2', 'tip - S'] })

const label = j.part('plant-label')
  .params({
    W: mm(60),        // writing panel:
                      // room for "Tomato 'Sungold'" in a 5 mm paint pen
    P: mm(25),
    t: mm(2),         // ten layers of 0.2 mm
    S: mm(90),        // spike length below the panel;
                      // about two thirds of it goes into the soil
    s: mm(9),         // spike width
    tip: mm(16),      // length of the taper at the point
    rib_w: mm(2.4),
    rib_h: mm(1.6),
  })
  .expose(['W', 'P', 'S', 't'], {
    labels: {
      W: 'panel width', P: 'panel height',
      S: 'spike length', t: 'thickness',
    },
    ranges: {
      W: [mm(30), mm(100)], P: [mm(15), mm(50)],
      S: [mm(40), mm(150)], t: [mm(1.2), mm(4)],
    },
  })
  .extrude(paddle.profiles(), 't', { id: 'panel' })
  .extrude(spike.profiles(), 't', { id: 'spike' })
  .extrude(rib.profiles(), 'rib_h', { id: 'rib' })

// Flat on the bed with the rib on top.
// PETG shrugs off sun and wet soil better than PLA.
return j.print('plant-label', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [label],
}).orient('+Z')
