// A knob: a revolved section with filleted rims, a torus-like surface seen from above.
const sec = j.sketch('sec', { on: j.plane.XZ }).rect('r', 18, 14, { at: [9, 7], center: true })
return j.part('knob')
  .revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'rev' })
  .fillet(j.feat('rev').faces().edges(), mm(3), { id: 'soft' })
