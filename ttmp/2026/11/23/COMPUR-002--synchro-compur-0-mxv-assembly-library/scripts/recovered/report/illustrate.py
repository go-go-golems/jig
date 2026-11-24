from pathlib import Path
import re, shutil
from PIL import Image
vault=Path('/home/manuel/code/wesen/go-go-golems/go-go-parc')
p=next((vault/'Projects/2026/11/23').glob('*Reconstructing the Synchro-Compur*.md'))
source=Path('/tmp/compur-report-figs')
s=p.read_text()
items=[
('## Which shutter','compur-m11.png','Assembled M-11 shutter viewed from the front at an angle','M-11 in the JigCAD Stage. The closed blades are visible through the front seat. The dimension arrows describe the modeled assembly bounds, including projections. The factory sheet separately dimensions the circular case and setting ring.'),
('There are three useful counts.','compur-plate7.jpg','Exploded drawing of the size-0 blade plate, blades and fastening screw','The size-0 inset on factory plate 7 (PDF p56) labels the retaining plate 225 and its screw 230. The small unboxed numerals at the blade outlines give the assembly order. Source: the supplied reconstruction archive’s plate-7 crop.'),
('Likewise the delay',None,'',''),
('## How a drawing becomes','compur-lesson9-timer.jpg','Lesson 9 side photograph of the delayed-action unit','Repair Course Lesson 9, figure 59. This side photograph of the size-00 delayed-action unit shows a layered cartridge. Its projected outline gives little information about the heights of the internal wheels. Source: the supplied archive’s figure-59 crop.'),
('## How a drawing becomes','compur-self-timer.png','Axonometric JigCAD drawing of the separate delayed-action cartridge','CP-07 in JigCAD. Compare the setting lever and spaced plates with the preceding service photograph. The open region between the modeled end mechanisms is where the unresolved intermediate train belongs.'),
('The archive subsequently fitted','compur-pivot-measurement.jpg','Front drawing with the fitted housing rim and the pinion measurement','Factory plate 2, size 00, with the archive’s fitted center and rim in teal and the center-to-pinion radius in orange. The overlay uses the original pixel coordinates in compur/book/data/plate2.json. Scaling this measurement to size 0 introduces the uncertainty discussed below.'),
('The enlarged axial section','compur-seat-section.png','Factory axial section showing the lens seats and bracketed size-0 dimensions','November 1956 specification page 1 (PDF p9), upper section detail. The horizontal line is the optical axis. The bracketed 20 mm spans the cell seats and the bracketed 6.1 mm gives the rear projection. Hatching identifies material on each side of the central mechanism.'),
('A ray here is','compur-blade-stroke.png','Five shutter blades projected at closed, middle and fully open positions','Plan projections regenerated from CP-02’s posed CAD meshes. Color distinguishes the five blades and the dashed circle marks the 25 mm test pupil. All three panels use the same scale and optical center.'),
('There is still a physical','compur-escapement.png','CP-03 workbench screenshot showing plan view, mechanism controls and service notes','CP-03 in the workbench. The plan view shows where the speed train sits on the plate. The Mechanism pane exposes the modeled joint values. To investigate the wheel–kicker overlap, the next measurement must resolve height along Z.'),
('## What would establish','compur-library.png','Code editor displaying the copied Compur part factory in a different preset','The published Compur library opened in the A-01 editor after copying it through Files. The visible tube factory contains both the front-seat construction and its named pivot ports.'),
]
assets=p.parent/'_assets'
assets.mkdir(exist_ok=True)
for anchor,name,alt,caption in items:
    if not name: continue
    assert s.count(anchor)==1 and name not in s
    with Image.open(source/name) as img: img.verify()
    assert not (assets/name).exists()
    shutil.copyfile(source/name,assets/name)
    s=s.replace(anchor,f'![{alt}](_assets/{name})\n\n*{caption}*\n\n'+anchor,1)
p.write_text(s)
refs=re.findall(r'!\[[^\]]*\]\((_assets/[^)]+)\)',s)
assert len(refs)==9 and all((p.parent/r).is_file() for r in refs)
print('Verified',len(refs),'embedded figure paths')
