// A tapered extrude: the frustum law h/3 · (A0 + A1 + √(A0·A1)).
const sq = j.sketch('sq', { on: j.plane.XY }).rect('r', 30, 30, { center: true })
return j.part('frustum').extrude(sq.profiles(), mm(20), { taper: deg(-10), id: 'f' })
