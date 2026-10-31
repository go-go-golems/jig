// H-09 · Measuring scoop: a bowl sized from the volume it must hold, with
// a flat handle that carries its label.
// Notice `r`: the bowl's radius is solved from the capacity in an
// expression, and the capacity can be checked by compiling the inside of
// the bowl on its own: set SHOW to 'capacity' and read the volume metric.
const ML = 30            // capacity in millilitres: 30 ml is a coffee scoop
const SHOW = 'scoop'     // 'capacity' compiles the bowl's inside as a solid

// the inside of the bowl: a hemisphere of radius r under a cylinder c tall,
// up to the rim; the scoop is measured level with the rim
const inside = j.sketch('inside', { on: j.plane.XZ })    // x: radius, z: up
  .polyline('p', [['r', 'floor + r'], ['r', 'H'], [0, 'H'], [0, 'floor']])
  .arc('bottom', { center: [0, 'floor + r'], start: [0, 'floor'],
    end: ['r', 'floor + r'] })

const P = {
  ml: ML,
  k: 0.5,            // depth of the straight part, as a fraction of r
  // V = π r² c + (2/3) π r³ with c = k r, so r = ∛(V / (π (k + 2/3)))
  r: 'pow(ml * 1000 / (pi * (k + 2 / 3)), 1 / 3) * 1 mm',
  c: 'k * r',
  wall: mm(2),
  floor: layer(10),  // 2 mm under the bottom of the bowl
  H: 'floor + r + c',   // the rim
  L: mm(70),         // handle length beyond the bowl
  hw: mm(16),        // handle width
  ht: mm(5),         // handle thickness
}

if (SHOW === 'capacity') {
  return j.part('capacity').params(P)
    .revolve(inside.profiles(), j.axis.Z, turn(1), { id: 'water' })
}

const scoop = j.part('measuring-scoop')
  .params(P)
  .expose(['k', 'wall', 'L'], {
    labels: { k: 'straight depth (× radius)', wall: 'wall thickness',
      L: 'handle length' },
    ranges: { k: [0, 1.5], wall: [mm(1.2), mm(4)], L: [mm(30), mm(120)] },
  })
  .extrude(j.region.circle('r + wall'), 'H', { id: 'bowl' })
  .extrude(j.region.slot([0, 0], ['r + wall + L', 0], 'hw'), 'ht',
    { id: 'handle' })
  // the bed edges: 0.4 mm in and 0.7 mm up, steeper than 45°
  .chamfer(j.feat('bowl').startFace().edges(), mm(0.4),
    { d2: mm(0.7), id: 'foot' })
  .revolve(inside.profiles(), j.axis.Z, turn(1), { op: 'cut', id: 'cavity' })
  .emboss(j.region.text(`${ML} ml`, { size: mm(7) }), layer(3),
    { on: j.feat('handle').endFace(), op: 'cut', id: 'label' })
  .hole([j.pt('r + wall + L - 4 mm', 0, 'ht')], j.hole.simple(mm(6)),
    { id: 'hang' })

// Upright, handle on the bed: the bowl opens upward, so its inside needs
// no support.
return j.print('measuring-scoop', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [scoop],
}).orient('+Z')
