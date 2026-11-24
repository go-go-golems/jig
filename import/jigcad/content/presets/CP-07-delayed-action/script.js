const p = await importPartFile('delay.parts.js')
let timer = j.assembly('V delayed action, cutaway')
  .add('lower', p.lower(), { ground: true })
  .add('upper', p.upper(), { at: j.tx.move(0, 0, 0) })
  .add('pillars', p.pillars(), { at: j.tx.move(0, 0, 0) })
  .add('screw', p.screw(), { at: j.tx.move(0, 0, 0) })
  .add('input', p.input())
  .add('ratchet', p.ratchet())
  .add('setting', p.setting())
  .add('clutch', p.clutch())
  .add('driveSpring', p.driveSpring(), { at: j.tx.move(0, 0, 0) })
  .add('star', p.star()).add('pallet', p.pallet()).add('locking', p.locking())
for (const [part, bearing] of [
  ['input', 'input'], ['setting', 'input'], ['star', 'star'],
  ['pallet', 'anchor'], ['locking', 'lock'],
]) {
  timer = timer.joint(part, j.joint.revolute(),
    'lower:' + bearing, part + ':axis')
}
return timer
  .joint('clutchFace', j.joint.rigid(), 'input:axis', 'ratchet:axis')
  .joint('clutchHook', j.joint.rigid(), 'setting:axis', 'clutch:axis')
