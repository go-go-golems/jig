// The mechanism plate carries the pallet-control lever pivot.
const segmentAngle = 0 // degrees of sector travel from the reference pose
const parts = await importPartFile('compur.parts.js')
const datum = j.frame({
  origin: j.pt(0, 0, 0), x: j.dir('+X'), z: j.dir('+Z'),
})
let train = j.assembly('Speeds escapement on mechanism plate')
  .add('base', parts.base().port('seat', datum), { ground: true })
  .add('escPlates', parts.escPlates().port('seat', datum))
  .joint('seat', j.joint.rigid(), 'base:seat', 'escPlates:seat')

for (const id of ['retard', 'segment', 'weight', 'w1', 'w2', 'star']) {
  train = train.add(id, parts[id]())
    .joint(id, j.joint.revolute(), 'escPlates:' + id + 'Pivot', id + ':pivot')
}
return train.add('carrier', parts.carrier())
  .add('pallet', parts.pallet())
  .joint('carrier', j.joint.revolute(), 'base:carrierPivot', 'carrier:pivot')
  .joint('pallet', j.joint.revolute(), 'carrier:palletPivot', 'pallet:pivot')
  .drive('segment', deg(segmentAngle))
  .couple('mesh1', 'segment', 'w1', { ratio: -90 / 6 })
  .couple('mesh2', 'w1', 'w2', { ratio: -64 / 6 })
  .couple('mesh3', 'w2', 'star', { ratio: -60 / 6 })
