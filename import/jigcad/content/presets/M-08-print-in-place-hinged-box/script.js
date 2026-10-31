// M-08 · Print-in-place hinged box: base and lid print side by side, already
// joined by a five-knuckle pin hinge, and the lid swings over to close.
// Notice the assembly: a revolute joint between ports on the hinge axis,
// and .printInPlace(), which measures every gap between the two parts.

// Numbers, because the hinge and the ports are placed with frames:
// W along the hinge, D across, each half h tall with the axis at rim height.
const W = 60, D = 40, h = 12, wall = 2, r = 4
// The hinge: Ø3 mm pin, 0.4 mm print-in-place clearance, 1.6 mm knuckle
// walls, so knuckles of radius R = 1.5 + 0.4 + 1.6 = 3.5 mm. Each half's back
// wall stands off = R + c from the axis, clear of the other half's knuckles.
const L = 50, n = 5, d = 3, c = 0.4, R = d / 2 + c + 1.6, off = R + c
const k = (L - (n - 1) * c) / n          // knuckle length, 9.68 mm
const x0 = -L / 2
const hinge = j.lib.hinge.pin({ knuckles: n, length: mm(L), d: mm(d),
  clearance: 'printInPlace', wall: mm(1.6) })
const axisFrame = j.frame({ origin: j.pt(x0, 0, h), x: j.dir('+Y'),
  z: j.dir('+X') })
// the joint turns about the port's z: −X swings the lid up and over
const port = j.frame({ origin: j.pt(0, 0, h), x: j.dir('+Y'),
  z: j.dir('-X') })

// A tray from y0 to y0 + D, open at the top.
const tray = (p, id, y0) => p
  .extrude(j.sketch(id, { on: j.plane.XY }).rect('box', `${W} mm`, `${D} mm`,
    { center: true, at: [0, `${y0 + D / 2} mm`], r: `${r} mm` }).profiles(),
  `${h} mm`, { id })
  .cut(j.sketch(`${id}Well`, { on: j.plane.offset(j.plane.XY, `${h} mm`) })
    .rect('well', `${W - 2 * wall} mm`, `${D - 2 * wall} mm`,
      { center: true, at: [0, `${y0 + D / 2} mm`], r: `${r - wall} mm` })
    .profiles(), `${h} mm - floor`, { id: `${id}Well` })
// Webs: under each knuckle a block from the bed up to R·cos 45° = 2.47 mm
// below the axis, where its underside turns steeper than 45°, and from the
// half's own wall to R past the axis, so no knuckle overhangs. They stop
// short of the pin and the bores.
const webTop = h - 2.5
const webs = (p, id, knuckles, y0, y1) => p.extrude(knuckles.reduce(
  (sk, i) => sk.rect(`k${i + 1}`, `${k} mm`, `${y1 - y0} mm`,
    { at: [`${x0 + i * (k + c)} mm`, `${y0} mm`] }),
  j.sketch(id, { on: j.plane.XY })).profiles(), `${webTop} mm`, { id })

// The base's half carries knuckles 1, 3, 5 and the pin (leaf a); the lid's
// carries 2 and 4, bored to the pin + 2 × 0.4 mm (leaf b).
const halfA = p => webs(tray(p, 'base', off), 'baseWebs', [0, 2, 4], -R, off)
const halfB = p => webs(tray(p, 'lid', -off - D), 'lidWebs', [1, 3], -off, R)
const start = name => j.part(name).params({ floor: layer(8) })
  .expose(['floor'], { labels: { floor: 'floor' },
    ranges: { floor: [mm(1), mm(3)] } })
const base = halfA(start('base'))
  .add(hinge, { at: axisFrame, leaf: 'a', id: 'hinge' }).port('hinge', port)
const lid = halfB(start('lid'))
  .add(hinge, { at: axisFrame, leaf: 'b', id: 'hinge' }).port('hinge', port)

// The assembly: lid on a revolute joint at the hinge axis, 0° as printed,
// 180° closed. printInPlace checks the gaps in the print pose.
const box = j.assembly('hinged-box')
  .params({ hinge: deg(0) })
  .add('base', base, { ground: true })
  .add('lid', lid)
  .joint('hinge', j.joint.revolute({ limits: [deg(0), deg(180)] }),
    'base:hinge', 'lid:hinge')
  .printInPlace(['base', 'lid'], { clearance: mm(c), pose: { hinge: deg(0) } })

// The print job prints both halves as one part with two bodies, because a
// job packs an assembly's parts apart; `leaf: 'both'` builds the two leaves
// together. Set printJob to true to compile it.
const printJob = false
const job = j.print('hinged-box', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [halfB(halfA(start('hinged-box')))
    .add(hinge, { at: axisFrame, leaf: 'both', id: 'hinge' })],
}).orient('+Z')
return printJob ? job : box
