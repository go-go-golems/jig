// Revolved surfaces: a knob (sphere cap, torus grip ring, cone) by revolving one profile (silhouettes of curved faces).
const sec = j.sketch('sec', { on: j.plane.XZ })
  .polyline('p', [[0, 0], [20, 0], [20, 6], [14, 18], [8, 24], [0, 26]], { closed: true })
return j.part('knob')
  .revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'body' })
  .fillet(j.feat('body').edges(), mm(1.5), { id: 'soft' })
