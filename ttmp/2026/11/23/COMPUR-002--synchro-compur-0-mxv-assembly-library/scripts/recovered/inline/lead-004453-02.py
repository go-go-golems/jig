from pathlib import Path
p=Path('import/jigcad/content/presets/M-11-synchro-compur/notes.md')
s=p.read_text().replace('29 parts drawn in jig from the repair manual\'s dimensions, 118.7 g in brass, steel and aluminium,','29 components drawn in Jig using the factory envelope, plate-derived arrangements and estimated internal geometry,')
s=s.replace('Move a part or a pivot in the script', 'Move a part or a pivot in the shared factory file').replace('## Where next','''## Inspect individual assemblies

Choose **Synchro-Compur** on the preset shelf. Start with [housing](lab:preset/CP-01) and [blades](lab:preset/CP-02), then follow the [timing train](lab:preset/CP-03), [cocking and release](lab:preset/CP-04), and [front controls](lab:preset/CP-05). The [flash contacts](lab:preset/CP-06), [delayed action](lab:preset/CP-07) and [diaphragm leaves](lab:preset/CP-08) have dedicated studies with their own evidence and assumptions. The complete shutter retains the archived diaphragm envelope and exposure animation. The tube wall crosses the moving-leaf planes and the first timing wheel overlaps the kicker. The subassembly notes identify the measurements needed to resolve these interfaces.

## Where next''')
p.write_text(s)
p=Path('import/jigcad/src/engine/worker.js')
p.write_text(p.read_text().replace('throw e.info ? e : scriptError(e, code, file);','throw e?.info ? e : scriptError(e, code, file);'))
p=next(Path('ttmp/2026/11/23').glob('COMPUR*/design-doc/*.md'))
s=p.read_text().replace('Moving one revolute in the workbench does not automatically engage the physical train.','CP-03 explicitly couples the wheel angles. Its ideal gear ratios enforce a kinematic relationship without simulating tooth contact.').replace('An inherited animation can still play smoothly through overlapping solids.', '''The shared library now raises the cam sleeve above the plate, separates the opening lug and ring body, relieves the stop track and rephases the cocking teeth. The 127:18 ratio is preserved. At the fixed 21.70 mm center distance, the revised pitch radii sum to 21.65 mm. The 0.05 mm allowance is a reconstruction choice.

Two consequential conflicts remain. The continuous optical tube intersects the moving-leaf planes. The first speed wheel overlaps the kicker at the same axial level. Raising that wheel alone would take it out of engagement with the next pinion. A section through the lens seats and independent arbor-height measurements would distinguish plausible repairs. An inherited animation can still play smoothly through overlapping solids.''')
p.write_text(s)
