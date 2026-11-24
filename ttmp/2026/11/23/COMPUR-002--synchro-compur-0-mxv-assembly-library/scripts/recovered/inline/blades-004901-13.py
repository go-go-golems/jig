from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('M-11*/compur.parts.js'))
s=p.read_text()
a=s.index('// Mounting tube')
b=s.index('})()',a)
s=s[:a]+'''// The November 1956 manufacturer's section (PDF p009, upper drawing)
  // shows separate front and rear seats on opposite sides of the leaves.
  // The flange on the rear seat belongs to the housing. Seat depth and
  // the clearance sector under the escapement are reconstruction choices.
  const bore = 28.9587 / 2
  const wall = j.region.circle(15.8).subtract(j.region.circle(bore))
  const window = j.region.polygon([[0, 0], [20, -10], [20, 5]])
  return j.part('Front mounting tube 204').color('#c9b37a').material(brass)
    .extrude(wall.subtract(window).on(j.plane.offset(j.plane.XY, mm(11.52))),
             mm(3.48), { id: 'relievedSeat' })
    .extrude(wall.on(j.plane.offset(j.plane.XY, mm(15))),
             mm(5), { id: 'frontSeat' })
'''+s[b:]
a=s.index("    .extrude(j.region.circle(1.6, { at: [-27.9559")
s=s[:a]+'''    // The rear threaded projection joins the web of the drawn cup.
    .extrude(j.region.circle(16.48).subtract(j.region.circle(28.9587 / 2))
             .on(j.plane.offset(j.plane.XY, mm(6.1))), mm(0.6),
             { id: 'rearSeatShoulder' })
    .extrude(j.region.circle(15.95).subtract(j.region.circle(28.9587 / 2))
             .on(j.plane.XY), mm(6.1), { id: 'rearFlange' })
    .add(j.lib.thread('M32.5x0.5', { length: mm(5.7) }),
         { at: j.axis.Z, id: 'flangeThread' })
'''+s[a:]
p.write_text(s)
p=next(Path('import/jigcad/content/presets').glob('CP-01*/notes.md'))
s=p.read_text().replace('Only the mounting thread has a helical feature.', '''Only the mounting thread has a helical feature. The cross-section shows separate front and rear cell seats, with the rear seat attached to the housing. The archive had run a continuous tube through both moving-leaf planes. The reconstructed rear flange now joins the housing web at Z 6.1–6.7 mm. The front seat starts at Z 11.52 mm on the other side of the leaves. Its partial skirt leaves room for the escapement. Internal lengths and reliefs are inferred.''')
p.write_text(s)
p=next(Path('import/jigcad/content/presets').glob('CP-02*/notes.md'))
s=p.read_text().replace('The continuous optical tube used in the housing study crosses the exposure-blade and diaphragm planes. A physical build needs the actual sectional drawings or a teardown to resolve the separate lens seats and moving-leaf clearances.', '''The continuous optical tube in the source archive crossed both moving-leaf planes. CP-01 splits the front and rear seats using the manufacturer's axial section.''')
p.write_text(s)
