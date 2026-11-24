// CP-06 · Flash contact stack, in an isolated local coordinate frame
// The contact lever sits above the M-closing lever on their common post.
const p = await importPartFile('contacts.parts.js')
const seat = { at: j.tx.move(0, 0, 0) }
return j.assembly('Flash contact study')
  .add('groundStrip', p.groundStrip(), { ground: true })
  .add('terminal', p.terminal(), seat)
  .add('mCloser', p.mCloser(), seat)
  .add('contact', p.contact(), seat)
