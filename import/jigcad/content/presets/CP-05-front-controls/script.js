// CP-05 · Front controls in their seated positions
// The cam ring lies below the setting ring and front retaining plate.
const p = await importPartFile('compur.parts.js')
const seat = { at: j.tx.move(0, 0, 0) }
return j.assembly('Front controls')
  .add('tube', p.tube(), { ground: true })
  .add('speedCam', p.speedCam(), seat)
  .add('speedRing', p.speedRing(), seat)
  .add('cover', p.cover(), seat)
