// A-06 · Extrude and revolve: Cavalieri and Pappus as volumes you can check.
// Extrude: volume = area of the profile × thickness. Revolve: volume =
// 2π × centroid radius × section area.
const outline = j.sketch('outline', { on: j.plane.XY })
  .rect('r', 'w', 'd', { center: true, r: 4 })
  .circle('h1', 1.7, { at: [32, 17] })
  .pattern(['h1'],
    j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y)))

const section = j.sketch('sec', { on: j.plane.XZ })
  .rect('s', 'ring_t', 'ring_h', { at: ['ring_r - ring_t / 2', 't'] })

return j.part('plate')
  .params({
    w: mm(80), d: mm(50),
    t: mm(4), ring_r: mm(18),
    ring_t: mm(3), ring_h: mm(8),
  })
  .expose(['w', 'd', 't', 'ring_r'])
  .material(j.material('PETG'))
  .extrude(outline.profiles(), 't', { id: 'body' })
  .revolve(section.profiles(), j.axis.Z, turn(1), { id: 'ring' })
