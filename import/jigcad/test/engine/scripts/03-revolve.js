// Pappus–Guldinus: a 4 × 10 mm section whose centroid is 25 mm from Z.
const sec = j.sketch('sec', { on: j.plane.XZ }).rect('r', 4, 10, { at: [25, 0], center: true })
return j.part('ring').revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'rev' })
