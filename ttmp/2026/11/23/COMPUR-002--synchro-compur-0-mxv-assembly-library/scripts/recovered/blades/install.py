from pathlib import Path
import json
root=Path('import/jigcad/content/presets')
lib=root/'M-11-synchro-compur/compur.parts.js'
s=lib.read_text()
for i,p in [(1,268),(5,267)]:
 s=s.replace(f'Blade 208 ({i})',f'Blade {p} ({i})').replace(f'Shutter blade 208, number {i}', f'Shutter blade {p} (tip bend simplified flat), number {i}')
a=s.index("  return j.part('Blade plate 225')")
b=s.index("    .cut(",a)
s=s[:a]+'''  // The size-0 inset on plate 7 shows five elongated openings.
  // Their pitch follows the five studs. Radius, length and width are estimates.
  let plate = j.region.circle(P.od / 2).subtract(j.region.circle(P.id / 2))
  for (let index = 0; index < 5; index++) {
    const angle = (79 + 72 * index) * Math.PI / 180
    const point = offset => [21.7 * Math.cos(angle + offset),
                             21.7 * Math.sin(angle + offset)]
    plate = plate.subtract(j.region.slot(point(-0.14), point(0.14), 2.3))
  }
  return j.part('Blade plate 225').color('#26272b')
    .material(steel).finish({ finish: 'black-oxide' })
    .extrude(plate.on(j.plane.offset(j.plane.XY, mm(P.z0))),
             mm(P.t), { id: 'plate' })
'''+s[b:]
lib.write_text(s)
def preset(code,slug,title,about,script,notes,tries):
 d=root/(code+'-'+slug)
 d.mkdir(exist_ok=True)
 (d/'meta.json').write_text(json.dumps(dict(id=code,title=title,group="Synchro-Compur",order=int(code[-2:]),difficulty="advanced",about=about,view="axo",overlays="shadows,grid",tries=tries),indent=2)+'\n')
 (d/'script.js').write_text(script.strip()+'\n')
 (d/'notes.md').write_text('# '+title+'\n\n'+notes.strip()+'\n')
 (d/'compur.parts.js').symlink_to('../M-11-synchro-compur/compur.parts.js')
preset('CP-01','housing','Housing and optical stack','Inspect the housing, lens tube, full-open diaphragm envelope and front cover.',"""
const parts = await importPartFile('compur.parts.js')
const seated = { at: j.tx.move(0, 0, 0) }
return j.assembly('Housing and optical stack')
  .add('housing', parts.housing(), { ground: true })
  .add('tube', parts.tube(), seated)
  .add('iris', parts.iris(), seated)
  .add('cover', parts.cover(), seated)
""","""
The rear mounting-tube end defines zero. Positive Z points toward the subject. The 1956 manufacturer's specification on PDF page 9, upper section, assigns the bracketed dimensions to CN-1210-000. It shows a 57.1 mm housing, 20 mm axial spacing, a 6.1 mm rear projection, M29.5 × 0.5 lens cell threads and an M32.5 × 0.5 mounting thread. The model represents the lens cell bore at the nominal minor diameter. Only the mounting thread has a helical feature.

The reconstruction gives the drawn shell a 0.6 mm wall and places the flat diaphragm envelope at Z 9.2–9.8 mm. Its 24 mm opening agrees with the bracketed diameter on the specification sheet. Wall thickness, internal stack heights and the annular envelope are modeling choices. See [the individual diaphragm leaves](lab:preset/CP-08) to inspect bearing and guide pins, and [the shutter pack](lab:preset/CP-02) for the five exposure blades.
""","Hide the cover to inspect the optical bore | Compare the tube's external helical thread to its two cell seats")
preset('CP-02','shutter-blades','Shutter blades and operating ring','Inspect five pivoted shutter leaves at an adjustable ring position.',"""
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
const pack = j.assembly('Shutter blade pack')
const centered = j.frame({ origin: j.pt(0, 0, 0),
                           x: j.dir('+X'), z: j.dir('+Z') })
pack.add('base', parts.base().port('ringAxis', centered), { ground: true })
pack.add('bladePlate', parts.bladePlate(), { at: j.tx.move(0, 0, 0) })
pack.add('ring', parts.ring())
pack.joint('ring', j.joint.revolute(), 'base:ringAxis', 'ring:pivot')
for (let i = 1; i <= 5; i++) {
  const id = 'blade' + i
  angles[id] = deg(swing * 180 / Math.PI)
  pack.add(id, parts[id]())
  pack.joint(id, j.joint.revolute(), 'base:' + id + 'Pivot', id + ':pivot')
}
return pack.params(angles)
""","""
Plate 7 of the Compur repair manual (PDF page 56, May 1956) puts the CN-1210-000 leaves and retaining plate in the lower-left inset. The numbered stack begins at drive 514's bearing sleeve. Positions 1 and 5 use blades 268 and 267 respectively. The three middle leaves use 208. The accompanying repair instructions specify slightly upturned first and last tips. The model retains planar tips and assigns each blade 0.08 mm thickness on successive 0.12 mm levels.

Change `stroke` and rebuild. The operating ring turns each pin around the optical axis. Each blade rotates about its own stud until its slot points at the new pin location. The code computes the signed angular difference of those two pin directions. Fivefold symmetry gives every blade the same angle. At 7.4 degrees of ring travel the result is approximately −36.7 degrees of leaf rotation. This is a pose calculation with six revolute joints. It does not simulate spring forces or friction.

The archive's design/blades.mjs searches for planar leaves that cover a 25 mm opening and clear the chamber, using a 21.7 mm pivot radius. Pin radius, slot size and the relief geometry are reconstruction dimensions. The relief count on 225 is visible on the size-0 plate. To see the leaves from either side, hide the two plates in the assembly tree.
""","Change stroke to 7.4 and rebuild | Hide both plates and inspect the five pivot holes")
