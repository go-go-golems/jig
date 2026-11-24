from pathlib import Path
p=Path('delay.parts.js')
s=p.read_text().replace('const plate = () =>', """const fixing = [3.5, -1.95], rearFixing = [10.2, -1.95]
const plate = () =>""").replace('.subtract(disk(anchor, .38)).subtract(disk(lock, .38))','.subtract(disk(anchor, .38)).subtract(disk(lock, .38))\n  .subtract(disk(fixing, .27)).subtract(disk(rearFixing, .27))').replace('  upper: () =>', """  pillars: () => metal('Timer plate distance pillars', brass,
    disk(fixing, .58).subtract(disk(fixing, .27))
      .union(disk(rearFixing, .58).subtract(disk(rearFixing, .27))),
    .33, upperZ - .33),
  screw: () => metal('Retaining screw, first gear end', steel,
    disk(fixing, .24), -.10, upperZ + .43)
    .extrude(disk(fixing, .56).on(j.plane.offset(j.plane.XY,
      mm(upperZ + .33))), mm(.24), { id: 'head' })
    .cut(bar([3.04, -1.95], [3.96, -1.95], .13)
      .on(j.plane.offset(j.plane.XY, mm(upperZ + .47))), mm(.14),
      { id: 'driverSlot' }),
  upper: () =>""")
p.write_text(s)
p=Path('script.js')
p.write_text(p.read_text().replace(".add('input', p.input())","""  .add('pillars', p.pillars(), { at: j.tx.move(0, 0, 0) })
  .add('screw', p.screw(), { at: j.tx.move(0, 0, 0) })
  .add('input', p.input())""".lstrip()))
