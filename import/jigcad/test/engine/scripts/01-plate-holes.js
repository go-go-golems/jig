// A plate with four M3 clearance holes from one sketch: holes are inner loops of the profile.
const outline = j.sketch('outline', { on: j.plane.XY })
  .rect('r', 80, 50, { center: true, r: 4 })
  .circle('h1', 1.7, { at: [32, 17] })
  .pattern(['h1'], j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y)))
return j.part('plate')
  .material(j.material('PETG'))
  .extrude(outline.profiles(), mm(4), { id: 'body' })
