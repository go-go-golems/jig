# Overlays

The debug drawings over the sheet, one hue each: forces amber, contacts and the centre of mass `st-rec`, the rig violet, sites green, the course blue.

**Provide**, in a view, a gate and marks: `if (!g.on('forces')) return;` then `g.arrow(p, vector, { tone: 'amber' })`, `g.dot(p, 2.6, { tone: 'accent' })`, `g.label('667 N', p, { tone: 'amber', dx: 6, size: 8 })`. Outside the workbench, pass `overlays: [...]` to `sheet()`.

- Switches: shadows, trail, annotations (Dims), grid, forces, contacts, rig, sites, course; in the Order menu, changes and truth.
- Scales: the leg force at 1 m per 2,500 N; contact forces at 1 m per 1,200 N. Say the scale wherever an arrow can be read.
- The light theme's amber is 2.68:1 on the sheet: keep amber marks bold enough and labels short, or put the value in ink.
- Don't add a hue. Choose from the table in the Overlays section by meaning.
