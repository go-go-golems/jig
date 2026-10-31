// 52 · Corpus measurement: what do 10,000 real printable models look like?
//
// Model
//   Thingi10K (Zhou & Jacobson, 2016) is a dataset of 10,000 models uploaded to Thingiverse.
//   For every model we measure topology (manifold, watertight, shells, Euler characteristic, genus),
//   printability (overhang area as uploaded and after auto-orientation, print-rule diagnostics),
//   and repairability (does .repair() make it watertight, and how far does it move the surface?).
//   For a closed orientable 2-manifold with k shells, χ = V − E + F = Σ (2 − 2gᵢ), so genus is defined only after a topology check.
//   Loading files is an effect. Each loaded file becomes a content-hashed value, so every measurement is pure and cached.
//
// Notice
//   - Measuring a corpus uses the same calls as checking one model; the corpus is just a list of values.
//   - A seeded sample gives a cheap pilot; the full run reuses every cached measurement from it.
//   - Reproducibility is data: the manifest of content hashes, the seed, the engine version and the code hash.
//
// Results in `// →` comments show the illustrative shape of a result; they are not findings about the dataset.

import { j, deg } from 'jig'

// ── 1. The corpus index (an effect) and a seeded pilot sample ──────────────
const index = await j.load.csv('data/thingi10k/metadata.csv')     // file_id, thing_id, license, ext, …
index.length                                                     // → 10000

const pilot = j.design({ i: j.param.int(0, index.length - 1) }, p => index[p.i]).sample(500, { seed: 52 })
// a design over row indices doubles as a seeded, reproducible sampler: same seed, same 500 files

// ── 2. Loading by format; unsupported formats are counted, never dropped silently ─
const loaders = { stl: j.load.stl, obj: j.load.obj, '3mf': j.load.tmf }
const load = async row => {
  const loader = loaders[row.ext.toLowerCase()]
  if (!loader) return { row, skipped: `unsupported format .${row.ext}` }
  const src = await loader(`data/thingi10k/raw_meshes/${row.file_id}.${row.ext}`)
  return { row, src, kind: j.ingest.auto(src).kind }               // sanity check: should be 'stl-mesh'
}

// ── 3. One measurement function, pure once the file is loaded ─────────────
const measure = ({ row, src, kind, skipped }) => {
  if (skipped) return { id: row.file_id, skipped }
  const topo = j.compile(j.mesh(src)).mesh()
  // → { faces, vertices, manifold, watertight, eulerChar, genus, shells, boundaryLoops, selfIntersections }
  const closed = topo.manifold && topo.watertight
  const out = {
    id: row.file_id, license: row.license, kind, faces: topo.faces, shells: topo.shells,
    manifold: topo.manifold, watertight: topo.watertight, selfIntersecting: topo.selfIntersections > 0,
    genus: closed ? topo.genus : null,                             // undefined unless the topology check passes
    overhangAsUploaded: j.inspect.overhang(src, { dir: '+Z', max: deg(45) }).fraction,
  }
  if (closed) {
    // closed and manifold, so χ = Σ(2 − 2gᵢ) holds (the suite's mesh.euler) and the genus is meaningful
    const P = j.compile(j.print(`t${row.file_id}`, { parts: [j.part(row.file_id).import(src)] }))
    const up = P.decisions.find(d => d.kind === 'orient').chose     // e.g. '+Y': the auto-orientation's build direction
    out.overhangAuto = j.inspect.overhang(src, { dir: up, max: deg(45) }).fraction
    out.supportVolume = P.metric('supportVolume')
    out.violations = j.check(P, j.rules.fdm).filter(d => d.level !== 'info').map(d => d.kind)
  } else {
    const fixed = j.mesh(src).repair({ holes: true, normals: true, selfIntersections: true, degenerate: true })
    const after = j.compile(fixed).mesh()
    out.repairedWatertight = after.manifold && after.watertight
    out.repairDeviation = j.inspect.hausdorff(src, fixed)          // how far the repair moved the surface
  }
  return out
}

// ── 4. Run the pilot, then the full corpus (cached results are reused) ─────
const run = async rows => {
  const out = []
  for (let k = 0; k < rows.length; k += 64) {                      // bounded concurrency for the loading effect
    const batch = await Promise.all(rows.slice(k, k + 64).map(load))
    out.push(...batch.map(measure))
  }
  return out
}
const pilotRows = await run(pilot)       // look at these first: do the measures mean what we think?
const allRows = await run(index)         // the 500 pilot files are not recomputed: compiles are cached by content hash
allRows.length                           // → 10000

// ── 5. Distributions ───────────────────────────────────────────────────────
const share = (rows, f) => rows.filter(f).length / rows.length
const quantiles = (xs, qs = [0.1, 0.5, 0.9]) => {
  const s = xs.filter(x => x != null).sort((a, b) => a - b)
  return Object.fromEntries(qs.map(q => [`p${q * 100}`, s[Math.floor(q * (s.length - 1))]]))
}
const loaded = allRows.filter(r => !r.skipped)
const summary = {
  skipped: allRows.length - loaded.length,
  manifold: share(loaded, r => r.manifold),
  watertight: share(loaded, r => r.watertight),
  multiShell: share(loaded, r => r.shells > 1),
  genus: quantiles(loaded.map(r => r.genus)),
  overhangAsUploaded: quantiles(loaded.map(r => r.overhangAsUploaded)),
  overhangAuto: quantiles(loaded.map(r => r.overhangAuto)),
  repairedToWatertight: share(loaded.filter(r => r.repairedWatertight != null), r => r.repairedWatertight),
  repairDeviation: quantiles(loaded.map(r => r.repairDeviation?.to('mm').value)),
}
summary
// → { skipped: 41, manifold: 0.74, watertight: 0.69, multiShell: 0.31,
//     genus: { p10: 0, p50: 0, p90: 4 },
//     overhangAsUploaded: { p10: 0.00, p50: 0.06, p90: 0.31 }, overhangAuto: { p10: 0.00, p50: 0.02, p90: 0.18 },
//     repairedToWatertight: 0.83, repairDeviation: { p10: 0.00, p50: 0.01, p90: 0.42 } }   (fractions; mm for deviation)

const violationCounts = Object.groupBy(loaded.flatMap(r => r.violations ?? []), k => k)
Object.fromEntries(Object.entries(violationCounts).map(([k, v]) => [k, v.length]))
// → { 'print.overhang': 2410, 'print.thinWall': 1187, 'print.bedFit': 96, 'print.thinFeature': 803, 'print.island': 655 }

// ── 6. Reproducibility record ──────────────────────────────────────────────
const record = {
  corpus: j.hash(index.map(r => r.file_id)),                       // the manifest of what was measured
  contentHashes: loaded.length,                                    // every loaded file's hash is in L0 of its compile
  seed: 52, pilotSize: pilot.length,
  rules: j.hash(j.rules.fdm), engine: j.version,                   // results change when the rules or the engine do
}
const probe = await load(index[0])
j.hash(j.compile(j.mesh(probe.src)).mesh()) === j.hash(j.compile(j.mesh(probe.src)).mesh())   // → true   (the same file gives the same measurements)
