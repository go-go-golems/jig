// 31 · Random-input router: whatever lands in the folder becomes a printable object
//
// Model
//   ingest.auto : Source → { kind, confidence, ranked, features }   (a classifier over file content, not file names)
//   route       : Source × (kind ↦ preset) → Model                  (presets are (data, ctx) => model)
//   Every preset is an ordinary jig model, so the routed result is a value: it hashes, diffs, compiles
//   and prints like anything written by hand. Loading is the only effect; everything after it is pure.
//
// Notice
//   - One table of six presets covers photos, silhouettes, logos, data, meshes and plain-language specs.
//   - The classifier ranks every kind. When confidence is low, build the top two and let metrics or a person decide.
//   - All routed models share one print job, so the batch packs onto plates like any other.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, lw } from 'jig'

// ── 1. Six presets, one per kind ─────────────────────────────────────────────
const lithophane = (img, ctx) => j.part('lithophane')
  .add(j.ingest.heightmap(img, { size: [mm(100), mm(75)], minT: mm(0.8), maxT: mm(3.2), invert: true }))   // dark → thick
  .extrude(j.region.rect(mm(104), mm(79), { center: true })
    .subtract(j.region.rect(mm(100), mm(75), { center: true })), mm(3.2), { id: 'frame' })

const cookieCutter = (img, ctx) => {
  const shape = j.ingest.trace(img, { threshold: 0.5, smooth: mm(0.5), width: mm(80) })   // → Region
  return j.part('cutter')
    .extrude(shape.offset(lw(2)).subtract(shape), mm(15), { id: 'blade' })                // 0.9 mm blade: two perimeters
    .extrude(shape.offset(mm(5)).subtract(shape.offset(lw(1))), mm(2), { id: 'flange' })
    .chamfer(j.feat('blade').endFace().edges(), mm(0.3), { id: 'edge' })
}

const keychain = (svg, ctx) => {
  const logo = j.region.svg(svg, { width: mm(40) })
  const tag = logo.offset(mm(2.5)).union(j.region.circle(mm(5), { at: [-22, 0] }))         // body + ring tab
  return j.part('keychain')
    .extrude(tag, mm(3), { id: 'tag' })
    .cut(j.region.circle(mm(2.5), { at: [-22, 0] }), { through: 'all' }, { id: 'ring' })
    .emboss(logo, mm(1), { on: j.feat('tag').endFace(), op: 'join', id: 'logo' })
    .color(j.feat('logo').faces(), 'white')                                                // a colour change at z = 3 mm
}

const barChart = (table, ctx) => {
  const rows = table.rows                                   // [{ month: 'Jan', value: 12 }, … { month: 'Dec', value: 21 }]
  const max = Math.max(...rows.map(r => r.value))           // 31 (July)
  return j.part('chart')
    .extrude(j.region.rect(mm(100), mm(20), { center: true }), mm(3), { id: 'base' })
    .extrude(j.sketch('bar', { on: j.feat('base').endFace() }).rect('b', 6, 6, { at: [-44, 0], center: true }).profiles(),
      mm(1), { id: 'bar' })
    .pattern(j.feat('bar'), j.pattern.linear(j.dir('+X'), { count: rows.length, step: mm(8) })     // 12 bars over 94 mm
      .vary((inst, ctx) => ({ extent: mm(40 * rows[inst.index].value / max) })), { id: 'bars' })
    .emboss(j.region.text(rows.map(r => r.month[0]).join('       '), { size: mm(4) }), mm(0.4),
      { on: j.feat('base').endFace(), op: 'cut', id: 'labels' })
}

const remixWithTab = (mesh, ctx) => j.part('hook-remix')
  .import(j.mesh(mesh).repair({ holes: true, normals: true, shells: 'keep-largest' }))
  .extrude(j.sketch('tab', { on: j.sel.faces('<Z').largest() }).slot('t', [0, 0], [18, 0], 8).profiles(), mm(3), { id: 'tab' })
  .hole(j.point.center(j.feat('tab').endFace()), j.hole.clearance('M3', { fit: 'slide' }), { id: 'screw' })

const boxFromSpec = (spec, ctx) => {
  const { w, d, h, wall = lw(3) } = spec.features
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
    .map(([sx, sy]) => j.pt(w.div(2).sub(mm(5)).mul(sx), d.div(2).sub(mm(5)).mul(sy), 0))
  return j.part('spec-box')
    .params({ w, d, h, wall })
    .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 'w', 'd', { center: true, r: 3 }).profiles(), 'h', { id: 'body' })
    .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
    .add(j.lib.insert('M3x5.7').boss({ wall: mm(2) }), { at: corners })                  // "M3 screws in the corners"
}

const route = {
  'image-photo': lithophane, 'image-silhouette': cookieCutter, 'svg-outline': keychain,
  'table-csv': barChart, 'stl-mesh': remixWithTab, 'spec-text': boxFromSpec,
}

// ── 2. Load (the only effect) and classify ───────────────────────────────────
const inbox = {
  photo: await j.load.image('inbox/grandma.jpg'),
  cat: await j.load.image('inbox/cat-silhouette.png'),
  logo: await j.load.svg('inbox/club-logo.svg'),
  sales: await j.load.csv('inbox/sales-2026.csv'),
  hook: await j.load.stl('inbox/broken-hook.stl'),
  spec: await j.load.json('inbox/request.json'),   // { text: 'a box 80x60x40 mm with 2 mm walls, M3 screws in the corners' }
}

j.ingest.auto(inbox.photo)
// → { kind: 'image-photo', confidence: 0.94,
//     ranked: [['image-photo', 0.94], ['image-silhouette', 0.05], ['svg-outline', 0.01]],
//     features: { px: [1600, 1200], tones: 'continuous', bimodal: false } }
j.ingest.auto(inbox.spec)
// → { kind: 'spec-text', confidence: 0.88, features: { w: 80 mm, d: 60 mm, h: 40 mm, wall: 2 mm, hardware: 'M3', at: 'corners' } }
j.ingest.auto(inbox.sales).features
// → { columns: ['month', 'value'], rows: 12, numeric: ['value'], range: [12, 31] }

// ── 3. Route everything ──────────────────────────────────────────────────────
const models = Object.fromEntries(Object.entries(inbox).map(([k, src]) => [k, j.ingest.route(src, route)]))

j.compile(models.hook).summary()
// → { imported: 'broken-hook.stl', repair: { shellsDropped: 1, holesFilled: 3, normalsFlipped: 112 },
//     features: 3, watertight: true, genus: 1 }
j.compile(models.sales).metric('height')
// → 43 mm   (base 3 mm + the July bar at 40 · 31/31 mm)
j.compile(models.spec).param('wall')
// → { value: 2 mm, src: 'params', note: 'from spec-text feature "2 mm walls" (confidence 0.88)' }

// ── 4. A low-confidence case: build both, then decide ────────────────────────
const badge = await j.load.image('inbox/badge-high-contrast.png')
const guess = j.ingest.auto(badge)
// → { kind: 'image-silhouette', confidence: 0.55, ranked: [['image-silhouette', 0.55], ['image-photo', 0.41], …] }

if (guess.confidence < 0.7) {
  const [a, b] = guess.ranked.slice(0, 2)
    .map(([kind]) => j.compile(j.print(kind, { parts: [route[kind](badge, guess)] })))
  a.metrics()   // → { printTime: 38 min, filament: 6.1 g, supportVolume: 0 }        the cookie cutter
  b.metrics()   // → { printTime: 2 h 05 min, filament: 21.4 g, supportVolume: 0 }   the lithophane
  // Neither is wrong. The router keeps both as variants (j.diff shows them as two branches) and asks.
}

// ── 5. One batch, packed onto plates ─────────────────────────────────────────
const batch = j.print('inbox-batch', { printer: j.printer('mk4'), material: j.material('PLA') })
  .add('lithophane', models.photo, { orient: '+Y' })        // stand it up: thickness becomes XY resolution
  .add('cutter', models.cat)
  .add('keychain', models.logo, { qty: 4 })
  .add('chart', models.sales)
  .add('hook', models.hook)
  .add('box', models.spec)
  .modifier(j.sel.bodies().of('lithophane'), { infill: { density: 1 }, walls: 6 })   // lithophanes print solid
  .use(j.rules.fdm)

const B = j.compile(batch)
B.plates
// → [{ plate: 1, parts: ['box', 'chart', 'cutter', 'keychain×4'], fill: 0.61 },
//    { plate: 2, parts: ['lithophane', 'hook'], fill: 0.22 }]
B.diagnostics
// → [{ level: 'warning', kind: 'print.textIllegible', at: 'chart.labels', message: 'stroke 0.42 mm < lw(1) = 0.45 mm',
//      fix: 'size: mm(5), or op: "join" for raised letters' }]

const { report } = j.export.tmf(B, { plates: true, colors: true })
report.kept      // → ['plates', 'settings', 'colors (keychain logo: change at z = 3.0 mm)']
