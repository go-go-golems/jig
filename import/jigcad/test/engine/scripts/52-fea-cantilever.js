// A stress study: a steel cantilever 60 × 6 × 6 mm, held at one end, 20 N down at the other. Beam theory gives the
// tip deflection (Timoshenko, with shear) and the bending stress My/I; the faces are the extrude's own names.
const L = 60, w = 6, h = 6
const beam = j.part('beam')
  .extrude(j.sketch('s', { on: j.plane.YZ }).rect('r', w, h, { center: true }).profiles(), mm(L), { id: 'body' })
return j.fea('cantilever', { part: beam, material: j.material('steel') })
  .params({ F: N(20) })
  .fix(j.feat('body').startFace(), { label: 'root' })
  .force(j.feat('body').endFace(), 'F', { dir: '-Z', label: 'tip' })
  .mesh({ size: mm(3), refine: false })
