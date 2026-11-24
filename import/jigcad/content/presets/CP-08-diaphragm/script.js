const parts = await importPartFile('diaphragm.parts.js')
const seated = { at: j.tx.move(0, 0, 0) }
let iris = j.assembly('Full-open five-leaf diaphragm')
  .add('guideCover', parts.guideCover(), { ground: true })
  .add('bearingCover', parts.bearingCover(), seated)
for (let i = 0; i < 5; i++) {
  iris = iris.add('leaf' + (i + 1), parts.leaf(i), seated)
}
return iris.interference()
