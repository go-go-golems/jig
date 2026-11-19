// A PLA column 10 × 10 × 100 mm under a pressure on its top and its own weight, standing on rollers: its base and
// two sides slide in their planes, so it shortens freely. The stress is uniaxial and linear in z, which quadratic
// tetrahedra represent exactly: the top moves p H / E + ρ g H² / 2E, the base carries p A + ρ g V.
const col = j.part('column')
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 10, 10).profiles(), mm(100), { id: 'body' })
return j.fea('column', { part: col, material: j.material('PLA') })
  .roller(j.feat('body').startFace(), { label: 'base' })
  .roller(j.sel.faces('<X'), { label: 'x side' })
  .roller(j.sel.faces('<Y'), { label: 'y side' })
  .pressure(j.feat('body').endFace(), MPa(0.01), { label: 'top' })
  .gravity()
  .mesh({ size: mm(5), refine: false })
