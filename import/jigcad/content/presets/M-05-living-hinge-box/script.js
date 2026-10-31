// M-05 · Living-hinge box: a one-piece clamshell for small parts. Two trays
// print side by side, joined at their rims by a 0.4 mm strip of PP that
// folds 180°. Notice where the hinge is: at rim height, so the halves meet
// rim to rim when it folds; a hinge on the bed would fold them back to back.

// Sizes are numbers because the hinge is placed with a transform, and
// transforms take numbers: each half W × D × h, walls `wall`, `gap` apart.
const W = 50, D = 35, h = 12, wall = 2, r = 4, gap = 1, t = 0.4

// one tray: a rounded block at y from y0 to y0 + D, with a pocket `inset`
// in from its sides
const tray = (p, id, y0, inset) => p
  .extrude(j.sketch(`${id}Outline`, { on: j.plane.XY })
    .rect('box', `${W} mm`, `${D} mm`,
      { center: true, at: [0, `${y0 + D / 2} mm`], r: `${r} mm` }).profiles(),
  `${h} mm`, { id })
  .cut(j.sketch(`${id}Pocket`, { on: j.plane.offset(j.plane.XY, `${h} mm`) })
    .rect('well', `${W} mm - 2 * (${inset})`, `${D} mm - 2 * (${inset})`,
      { center: true, at: [0, `${y0 + D / 2} mm`], r: `${r - wall} mm` })
    .profiles(), `${h} mm - floor`, { id: `${id}Pocket` })

let box = j.part('clamshell')
  .params({
    floor: layer(6),
    lip: mm(2),        // how far the lid's lip reaches into the base
    lipT: lw(3),       // lip thickness
    slip: mm(0.25),    // lip to base wall: a slide fit for PP
  })
  .expose(['floor', 'lip', 'slip'], {
    labels: { floor: 'floor', lip: 'lip height', slip: 'lip clearance' },
    ranges: { floor: [mm(0.8), mm(3)], lip: [mm(1), mm(4)],
      slip: [mm(0.1), mm(0.6)] },
  })
// The lid's walls are thicker by the lip and its clearance, so the lip
// stands on them and still fits inside the base.
box = tray(box, 'base', gap / 2, `${wall} mm`)
box = tray(box, 'lid', -gap / 2 - D, `${wall} mm + slip + lipT`)

// The hinge: a strip `t` thick across the gap, its top flush with the rims.
// It overlaps each rim by 2 mm, the wall's thickness.
box = box.add(j.lib.hinge.living({ length: mm(W - 2 * r - 4),
  thickness: mm(t), gap: mm(gap), material: 'PP' }),
{ at: j.tx.move(0, 0, h - t), id: 'hinge' })

// The lid's lip: a ring on the inner edge of its rim that goes into the base
// when closed and holds it shut by friction. It stops short of the hinge
// side, so it clears the base's back wall as the lid swings over.
const yl = -gap / 2 - D / 2, rim = j.plane.offset(j.plane.XY, `${h} mm`)
const inner = k => `${k} mm - 2 * (${wall} mm + slip)`
box = box
  .extrude(j.sketch('lipRing', { on: rim })
    .rect('out', inner(W), inner(D),
      { center: true, at: [0, `${yl} mm`], r: `${r - wall} mm` })
    .rect('in', `${inner(W)} - 2 * lipT`, `${inner(D)} - 2 * lipT`,
      { center: true, at: [0, `${yl} mm`], r: `${r - wall} mm` })
    .profiles(), 'lip', { id: 'lip' })
  .cut(j.sketch('lipBack', { on: rim }).rect('back', `${W} mm`, mm(6),
    { center: true, at: [0, `${-gap / 2 - 3} mm`] }).profiles(),
  { two: ['lip', 0] }, { id: 'lipBack' })
  // a tab on the lid's front edge to open it with a thumb
  .extrude(j.sketch('tab', { on: j.plane.XY })
    .rect('tab', mm(14), mm(5), { center: true,
      at: [0, `${-gap / 2 - D - 2} mm`], r: mm(2) }).profiles(), mm(1.2),
  { id: 'tab' })

// PP: the only common filament a living hinge survives in for long. Both
// trays print open side up; the hinge is bridged across the gap, so its
// lines run across the fold, which is what a hinge needs.
return j.print('clamshell', {
  printer: j.printer('generic-fdm'), material: j.material('PP'),
  parts: [box],
}).orient('+Z')
