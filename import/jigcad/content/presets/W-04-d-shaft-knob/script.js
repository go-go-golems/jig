// W-04 · Knob for a D-shaft: a fluted knob that presses onto a 6 mm D-shaft
// and is locked by an M3 grub screw. Notice the print orientation: upside
// down, so the D-bore is vertical and true, while the grub-screw hole lies
// horizontal and becomes a teardrop by itself.
// Shaft: Ø6 mm with a flat 1.5 mm deep (4.5 mm across the flat), as on
// most potentiometers, encoders and small gear motors.

// the grip: a rim with 18 flutes; profile([0, 0]) keeps the region that
// holds the centre, so the flutes' outer halves are left out. The first
// flute sits half a step round from +X, so the pointer (along +X) ends on
// a ridge.
const grip = j.sketch('grip', { on: j.plane.XY })
  .circle('rim', 'R')
  .circle('flute', 'flute_r', { at: [
    '(R + flute_r - flute_d) * cos(180 deg / flutes)',
    '(R + flute_r - flute_d) * sin(180 deg / flutes)'] })
  .pattern(['flute'], j.pattern.circular(j.axis.Z, { count: 'flutes' }))

// the D-bore: an arc a snug gap bigger than the shaft, the long way round
// from one end of the flat to the other, closed by the flat
const dBore = j.sketch('d', { on: j.plane.XY })
  .arc('a', { center: [0, 0], start: ['-chord', 'flat_at'],
    end: ['chord', 'flat_at'] })
  .line('flat', 'a.end', 'a.start')

// the pointer: a groove across the top, from the centre to the rim
const pointer = j.region.rect('R', mm(1.2), { at: ['R / 2 + 2 mm', 0] })

const knob = j.part('d-shaft-knob')
  .params({
    R: mm(15),             // Ø30 mm
    h: mm(16),
    flutes: 18,
    flute_r: mm(2),
    flute_d: mm(1.2),      // how deep each flute cuts into the rim
    shaft: mm(6),
    flat: mm(4.5),         // across the flat
    gap: mm(0.1),          // per side: the snug class, a push fit
    flat_at: 'flat - shaft / 2 + gap',   // the flat, from the shaft's axis
    chord: 'sqrt(pow(shaft / 2 + gap, 2) - pow(flat_at, 2))',   // half of it
    bore_d: mm(12),        // how far the shaft goes in
    screw_z: mm(6),        // height of the grub screw
  })
  .expose(['R', 'h', 'flutes', 'shaft', 'flat'], {
    labels: {
      R: 'radius', h: 'height', flutes: 'number of flutes',
      shaft: 'shaft diameter', flat: 'across the flat',
    },
    ranges: {
      R: [mm(8), mm(30)], h: [mm(8), mm(30)], flutes: [6, 36],
      shaft: [mm(3), mm(8)], flat: [mm(2), mm(7)],
    },
  })
  .extrude(grip.profile([0, 0]), 'h', { id: 'body' })
  .cut(dBore.profiles(), 'bore_d', { id: 'bore' })
  .emboss(pointer, mm(0.6), { on: j.feat('body').endFace().largest(),
    op: 'cut', id: 'pointer' })
  // the grub screw: from a point outside the rim, in along −Y to the flat,
  // self-tapping into the plastic
  .hole(j.sketch('screw', { on: j.plane.offset(j.plane.XZ, '-(R + 1 mm)') })
    .point('s', [0, 'screw_z']),
  j.hole.tapped('M3', { depth: 'R + 1 mm' }), { id: 'grub' })

// Upside down: the flat top lies on the bed and the pointer groove is
// bridged over 1.2 mm; the bore points up and prints round.
return j.print('d-shaft-knob', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [knob],
}).orient('-Z').use(j.rules.fdm)
