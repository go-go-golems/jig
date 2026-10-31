// A 40-hole plate: one hole feature, positions from a sketch with a grid of points.
let pts = j.sketch('pts', { on: j.plane.offset(j.plane.XY, mm(5)) })
for (let i = 0; i < 8; i++) for (let k = 0; k < 5; k++) pts = pts.point(`p${i}_${k}`, [-70 + i * 20, -40 + k * 20])
return j.part('perf')
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 170, 100, { center: true }).profiles(), mm(5), { id: 'body' })
  .hole(pts, j.hole.clearance('M3', { fit: 'slide' }), { id: 'holes' })
