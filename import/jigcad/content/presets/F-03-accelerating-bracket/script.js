const material = j.material('aluminium').with({
  modulus: GPa(69), strength: MPa(150),
})
const section = j.sketch('section', { on: j.plane.YZ })
  .rect('rectangle', 10, 4, { center: true })
const bracket = j.part('Bracket').material(material)
  .extrude(section.profiles(), mm(50), { id: 'arm' })

return j.fea('Accelerating bracket', { part: bracket })
  .fix(j.feat('arm').startFace(), { label: 'mount' })
  .accel(25, { dir: '+Z', label: 'upward base acceleration' })
  .mesh({ size: mm(5), refine: false })
  .solver('js')
