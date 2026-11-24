from pathlib import Path
root=next(Path('ttmp/2026/11/23').glob('COMPUR-002*'))
p=next((root/'design-doc').glob('*.md'))
s=p.read_text().replace('tube end planes','rear housing flange to front tube end').replace('tube builder and bore approximation','rear flange thread and cell bores').replace('The existing tube represents some interfaces by a bore or simplified threaded feature. Inspect its feature list before using it as a gauge.', 'The rear housing carries the external flange thread. The front and rear cell bores use nominal minor diameters. Inspect both builders before using the seats as a gauge.')
s=s.replace('Two consequential conflicts remain. The continuous optical tube intersects the moving-leaf planes. The first speed wheel overlaps the kicker at the same axial level. Raising that wheel alone would take it out of engagement with the next pinion. A section through the lens seats and independent arbor-height measurements would distinguish plausible repairs.', '''The enlarged factory section on PDF p9 shows two lens seats on opposite sides of the leaves. The earlier reconstruction ran a tube through the leaves. In the revised CAD the rear flange joins housing 101 and the relieved front seat 204 starts at Z 11.52 mm. The separateness of the seats is visible in the manufacturer's section. The front skirt length and relief angles are estimates. A remaining conflict lies deeper in the escapement. The first speed wheel overlaps the kicker at the same axial level. Raising that wheel alone would take it out of engagement with the next pinion. Measure both arbor stacks before changing either height.''')
s += '''
## Component cross-reference

Use the first column below to find a member in the M-11 assembly tree, then open the factory of the same name. Grounded and fixed-at-placement components carry load or define an interface even when they have no animation track.

| Assembly instance IDs | What the builder represents | Evidence and inspection limit |
|---|---|---|
| housing, tube | Outer case, rear flange and separate front cell seat | Specification p9, CP-01. Internal relief and wall gauges are estimates. |
| base, bladePlate | Bearing plate and shutter leaf retainer | Plate 7 and the size-0 inset on p56. Inspect the five studs, openings and relieved stop track. |
| blade1 … blade5 | Service stack 268, 208, 208, 208, 267 | Inset and repair sequence. Swept reconstructions retain flat ends. |
| ring | Common actuator with pins for the five shutter leaves | Plate 7 and closed/open reconstruction. Stroke and swept clearances are checked in CP-02. |
| cam, pinion, cockingRing | Main drive, coaxial winding pinion and setting sector | Lesson 9 figs 39–42. Tooth ratio and backlash allowance belong to the reconstruction. |
| bridge, latch, release | Support, catch and trip | Fig 79 and the operating sequence. The real eccentric and spring preload need measurements. |
| escPlates, retard, segment, weight | Cartridge, input lever, sector and inertia weight | Factory plate 5 and Lesson 9 figs 31–37, 60–62. Stroke engagement changes with speed. |
| w1, w2, star | Compound wheel trains and escape wheel | Archive chapter 11. Verify tooth counts and wheel heights on the actual unit. |
| carrier, pallet | Support for the pallet and its rocking escapement member | Lesson 9 and CP-03. A calibrated average brake supplies the inherited timing law. |
| speedCam, speedRing, cover | Setting profile envelope, operator's ring and retaining cover | Figs 23–26 and the factory envelope. Indexing contours, knurl and engraving are incomplete. |
| iris | Full-open diaphragm envelope in the complete model | CP-08 resolves the five leaves and covers in a separate study of the replacement configuration. |

The light-coverage test projects the actual five blade meshes onto a lattice over the 25 mm working pupil. With 31,417 sample points, the closed pose blocked all samples, 3.7° of ring stroke blocked 18,859 and 7.4° blocked zero. This checks the reconstructed leaf contours at three positions. The diaphragm's independent full-open setting uses the 24 mm factory opening. Neither a light trace through real lenses nor a continuous sweep of all contacts has been measured.
'''
p.write_text(s)
p=Path('import/jigcad/content/presets/M-11-synchro-compur/notes.md')
p.write_text(p.read_text().replace('The tube wall crosses the moving-leaf planes and the first timing wheel overlaps the kicker.', 'The factory section separates the lens seats on opposite sides of the blades. One unresolved internal fit is the first timing wheel overlapping the kicker.'))
p=next((root/'playbook').glob('*.md'))
p.write_text(p.read_text().replace('rear end of tube 204','rear end of the threaded housing flange').replace('two reproducible checks', 'three reproducible checks').replace('After rebuilding the shelf,', 'Run scripts/check-blade-aperture.mjs with Node to project the assembled leaves at three stroke positions. After rebuilding the shelf,'))
p=root/'tasks.md'
p.write_text(p.read_text().replace('- [ ] Compile', '- [x] Compile').replace('- [ ] Validate','- [x] Validate'))
