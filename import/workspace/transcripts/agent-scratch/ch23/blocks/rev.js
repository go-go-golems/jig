// view: axo
const ring = j.region.rect(4, 10, { at: [12, 0] }).on(j.plane.XZ)
return j.part('ring').revolve(ring, j.axis.Z, deg(180), { id: 'rev' })
