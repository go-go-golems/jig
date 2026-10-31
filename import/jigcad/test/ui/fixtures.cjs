// Book chapters and shelf docs for the UI test, injected as globalThis.__JIG_CONTENT__ before the app loads, so the
// reading views can be tested before content/book and content/docs are written.
const fence = '```';

const ch1 = `---
part: I · Foundations
partAbout: Units, parameters and the first solids: what a part is made of before it is printed.
presets: A-01, A-06
docs: extrude
book: Parts from First Principles
---
# Extrude and shell

This chapter builds the box of [A-01 A box with walls](lab:preset/A-01) from one sketch, one extrude and one shell, and shows how each feature names the faces it makes. By the end you can read a persistent name and say which feature made the face and where it came from.

## 1.1 A profile and a height

An **extrude** sweeps a closed profile along the normal of its sketch plane. Its volume is the profile's area times the height, $V = A \\cdot h$, whatever the profile's shape: for a 60 × 40 mm rectangle and 30 mm that is 72,000 mm³.

${fence}figure
// view: axo
// overlays: dims
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30) })
  .extrude(j.sketch('base', { on: j.plane.XY }).rect('outline', 'w', 'd', { center: true }).profiles(), 'h', { id: 'body' })
${fence}

**Figure 1.1.** The extrude of a 60 × 40 mm rectangle by 30 mm, axonometric, drawn from the compiled part.

## 1.2 Shelling

A **shell** removes some faces and offsets the rest inwards by a wall thickness. The box of A-01 removes the end face of \`body\`:

${fence}js
.shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
${fence}

${fence}sketch
// title: A box with 1.2 mm walls
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(1.2) })
  .extrude(j.sketch('base', { on: j.plane.XY }).rect('outline', 'w', 'd', { center: true }).profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
${fence}

> **Try it.** [Load A-01](lab:preset/A-01), [select the rim](lab:select/body/end) and [look from the front](lab:view/stage?view=front).

## 1.3 Key points

- An extrude's volume is its profile's area times its height.
- A shell keeps the names of the faces it offsets inside its own: \`shell/inner[body/side[base.outline.bottom]]\`.

## Exercises

> **Exercise.** Change the wall to 0.8 mm and read the warning the compiler gives.
`;

const ch2 = `---
part: I · Foundations
presets: A-06
---
# Revolve

A **revolve** turns a section about an axis. Its volume is the section's area times the distance its centroid travels (Pappus): see [A-06 Extrude and revolve](lab:preset/A-06).

## 2.1 Pappus

| section | area | centroid radius | volume |
|---|--:|--:|--:|
| 3 × 8 mm | 24 mm² | 18 mm | 2,714 mm³ |
`;

const ch3 = `---
part: II · Design process
partAbout: Searching a design space against objectives, with every point a fresh compile.
presets: E-01
---
# Search

A search compiles many points of a design space. [E-01 Search a wall hook](lab:preset/E-01) searches arm thickness and width.

## 3.1 A grid
`;

const docs = {
  reference: `# Reference

The jig API on one page: every builder, its methods and their units.

## Units

\`mm(3)\`, \`deg(45)\`, \`gram(12)\`: every quantity has a unit. Bare numbers in typed slots are millimetres.

## Parts

${fence}js
j.part(name).params({ w: mm(60) }).extrude(profile, 'h', { id: 'body' })
${fence}

### extrude

\`.extrude(profile, extent, { op, taper, id })\`: a profile and a height.

### shell

\`.shell(openFaces, t, { direction, id })\`: remove faces and offset the rest.

## Sketches

\`j.sketch(id, { on })\` then \`.rect\`, \`.circle\`, \`.line\` and constraints.
`,
  '10-extrude': `---
id: extrude
title: Extrude and Cavalieri
group: Geometry
about: Why an extrude's volume is its profile's area times its height, and where the kernel checks it.
order: 10
---
# Extrude and Cavalieri

An extrude sweeps a profile along a straight line. Cavalieri's principle gives its volume: $V = A \\cdot h$.

## The law

The suite checks \`extrude.volume\` against the kernel for random profiles.

## In the workbench

> **Try it.** [Load A-01](lab:preset/A-01) and [make it 80 mm wide](lab:param/w=80).
`,
  '20-names': `---
id: names
title: Persistent names
group: Topology
about: How faces are named by the features that made them, and why the names survive edits.
order: 20
---
# Persistent names

A face is named \`feature/role[source]\`.
`,
};

// The shelf at the size it is heading for (about 50 presets): copies of the published presets under other ids and
// groups, so the header's preset menu (groups, filter, keyboard) and the Presets view are tested at scale. Ids use
// letters the shelf does not (Q, V, Y, Z), and any id a real preset has is skipped, so none is ever shadowed.
const fs = require('fs'), path = require('path');
function shelfFill(target = 50) {
  const PD = path.join(__dirname, '../../content/presets');
  const real = fs.readdirSync(PD).filter(d => fs.existsSync(path.join(PD, d, 'meta.json')) && fs.existsSync(path.join(PD, d, 'script.js'))).sort();
  const groups = ['Around the house', 'Workshop and repair', 'Electronics', 'Mechanisms'];
  const out = [], taken = new Set();
  for (const d of real) { try { taken.add(JSON.parse(fs.readFileSync(path.join(PD, d, 'meta.json'), 'utf8')).id); } catch { /* half-written */ } }
  for (let i = 0; real.length && real.length + out.length < target && i < 400; i++) {
    const d = real[i % real.length];
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(PD, d, 'meta.json'), 'utf8')); } catch { continue; }
    const files = {};
    for (const f of fs.readdirSync(path.join(PD, d))) if (f !== 'meta.json' && fs.statSync(path.join(PD, d, f)).isFile()) files[f] = fs.readFileSync(path.join(PD, d, f), 'utf8');
    const g = i % groups.length;
    const id = `${'QVYZ'[g]}-${String(i + 1).padStart(2, '0')}`;
    if (taken.has(id)) continue;
    out.push({ ...meta, id, group: groups[g], order: i + 1, title: `${meta.title} (shelf copy)`, files });
  }
  return out;
}

module.exports = { content: { book: [{ file: '01-extrude-and-shell.md', text: ch1 }, { file: '02-revolve.md', text: ch2 }, { file: '03-search.md', text: ch3 }], docs, presets: shelfFill() }, shelfFill };
