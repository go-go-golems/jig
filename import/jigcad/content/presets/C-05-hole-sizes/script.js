// C-05 · Hole sizes: seven nominal holes, Ø2 to Ø10 mm, drilled down through
// a plate and sideways through a wall. Notice that the sideways holes come
// out as teardrops by themselves: the kernel knows the build direction.
const sizes = [2, 3, 4, 5, 6, 8, 10]   // mm, as modelled: no fit, no comp
const n = sizes.length

const test = j.part('hole-sizes')
  .params({
    pitch: mm(14),    // hole to hole
    plate: mm(5),     // thickness of the plate the vertical holes go through
    depth: mm(20),    // plate depth (along Y)
    wall: mm(6),      // thickness of the wall the horizontal holes go through
    H: mm(18),        // wall height: the largest teardrop plus 2 mm or more
  })
  .expose(['plate', 'wall', 'pitch'], {
    labels: { plate: 'plate thickness', wall: 'wall thickness',
      pitch: 'hole to hole' },
    ranges: { plate: [mm(2), mm(10)], wall: [mm(2), mm(12)],
      pitch: [mm(13), mm(25)] },
  })
  .extrude(j.sketch('foot', { on: j.plane.XY })
    .rect('plate', `${n} * pitch`, 'depth', { at: [0, 0] }).profiles(),
  'plate', { id: 'plate' })
  .extrude(j.sketch('side', { on: j.plane.XY })
    .rect('wall', `${n} * pitch`, 'wall', { at: [0, 'depth'] }).profiles(),
  'H', { id: 'wall' })

// One hole feature per size and direction, each at a sketch point: `down2` …
// `down10` from the top of the plate, `across2` … `across10` from the front
// of the wall (the XZ plane faces −Y, so its holes drill +Y into the wall).
const top = j.plane.offset(j.plane.XY, 'plate')
const front = j.plane.offset(j.plane.XZ, '-depth')
const drilled = sizes.reduce((p, d, k) => {
  const x = `${k + 0.5} * pitch`
  const down = j.sketch(`d${d}`, { on: top })
    .point('c', [x, 'depth / 2 + 2 mm'])
  const across = j.sketch(`a${d}`, { on: front }).point('c', [x, 'H / 2'])
  return p
    .hole(down, j.hole.simple(mm(d)), { id: `down${d}` })
    .hole(across, j.hole.simple(mm(d)), { id: `across${d}` })
}, test)

// the smallest and the largest size, engraved on the plate in front
const tag = { size: mm(4), align: 'center', valign: 'middle' }
const labels = j.sketch('labels', { on: top })
  .text('first', String(sizes[0]), { ...tag, at: ['pitch / 2', 4] })
  .text('last', String(sizes[n - 1]),
    { ...tag, at: [`${n - 0.5} * pitch`, 4] })

// Upright: the plate on the bed, the wall standing, so the plate's holes are
// vertical and the wall's are horizontal, as in most real parts.
return j.print('hole-sizes', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [drilled.cut(labels.profiles(), { two: [mm(0), mm(0.6)] },
    { id: 'labels' })],
}).orient('+Z')
