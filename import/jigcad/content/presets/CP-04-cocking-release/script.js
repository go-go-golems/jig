// CP-04 · Setting and releasing the drive cam
// Four bearings preserve the model's closed-blade reference pose.
const p = await importPartFile('compur.parts.js')
const fixed = { at: j.tx.move(0, 0, 0) }
return j.assembly('Cocking and release')
  .add('base', p.base(), { ground: true })
  .add('tube', p.tube(), fixed)
  .add('bridge', p.bridge(), fixed)
  .add('cockingRing', p.cockingRing())
  .add('pinion', p.pinion())
  .add('cam', p.cam())
  .add('latch', p.latch())
  .add('release', p.release(), fixed)
  .joint('setting', j.joint.revolute(), 'tube:cockingRingPivot',
    'cockingRing:pivot')
  .joint('pinion', j.joint.revolute(), 'base:pinionPivot', 'pinion:pivot')
  .joint('cam', j.joint.revolute(), 'base:camPivot', 'cam:pivot')
  .joint('latch', j.joint.revolute(), 'bridge:latchPivot', 'latch:pivot')
