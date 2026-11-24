from pathlib import Path
p=Path('notes.md')
p.write_text(p.read_text().replace('Joint changes move the selected body independently.', 'The three external meshes reverse direction at each stage. In the script change the segment drive from 0° to 0.05°; the ideal coupling rotates the star −80°. The lever, weight and pallet remain independent.'))
