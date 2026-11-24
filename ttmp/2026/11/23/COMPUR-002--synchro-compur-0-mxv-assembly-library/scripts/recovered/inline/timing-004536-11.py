from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('CP-07*/notes.md'))
p.write_text(p.read_text().replace('Lift the upper plate in the assembly browser or look through its cutaway to inspect the input end and the pallet end.', 'Look through the upper plate cutaway to inspect the input end and the pallet end. The screw at the input end passes through a distance pillar between the two plates.'))
p=next(Path('import/jigcad/content/presets').glob('CP-07*/script.js'))
p.write_text(p.read_text().replace("  timer = timer.joint(part, j.joint.revolute(), 'lower:' + bearing, part + ':axis')","  timer = timer.joint(part, j.joint.revolute(),\n    'lower:' + bearing, part + ':axis')"))
