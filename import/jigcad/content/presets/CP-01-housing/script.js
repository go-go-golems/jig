const parts = await importPartFile('compur.parts.js')
const seated = { at: j.tx.move(0, 0, 0) }
return j.assembly('Housing and optical stack')
  .add('housing', parts.housing(), { ground: true })
  .add('tube', parts.tube(), seated)
  .add('iris', parts.iris(), seated)
  .add('cover', parts.cover(), seated)
