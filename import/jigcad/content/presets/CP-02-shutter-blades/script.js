const parts = await importPartFile('compur.parts.js')
// From closed to full clear, change this value from 0 to 7.4 degrees.
const stroke = 0
const phi = stroke * Math.PI / 180
const [cx, cy] = [15.8704, 14.7994]
const [px, py] = [14.0835, 11.528]
// A pin sliding in a straight radial slot sets the leaf direction.
const heading = (x, y) => Math.atan2(y - cy, x - cx)
const x = px * Math.cos(phi) - py * Math.sin(phi)
const y = px * Math.sin(phi) + py * Math.cos(phi)
const swing = Math.atan2(Math.sin(heading(x,y) - heading(px,py)),
                         Math.cos(heading(x,y) - heading(px,py)))
const angles = { ring: deg(stroke) }
let pack = j.assembly('Shutter blade pack')
const centered = j.frame({ origin: j.pt(0, 0, 0),
                           x: j.dir('+X'), z: j.dir('+Z') })
pack = pack.add('base', parts.base().port('ringAxis', centered), { ground: true })
pack = pack.add('bladePlate', parts.bladePlate(), { at: j.tx.move(0, 0, 0) })
pack = pack.add('ring', parts.ring())
pack = pack.joint('ring', j.joint.revolute(), 'base:ringAxis', 'ring:pivot')
for (let i = 1; i <= 5; i++) {
  const id = 'blade' + i
  angles[id] = deg(swing * 180 / Math.PI)
  pack = pack.add(id, parts[id]())
  pack = pack.joint(id, j.joint.revolute(), 'base:' + id + 'Pivot', id + ':pivot')
}
return pack.params(angles).interference()
