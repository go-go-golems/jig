// 11 · Sweeps, lofts and printed threads: frames along curves
//
// Model
//   sweep(P, γ, F) = ⋃ₛ γ(s) + F(s)·P, where F : [0, L] → SO(3) is a frame field along the path γ.
//   Frenet frame (T, N, B): built from γ′ and γ″. Undefined where the curvature κ = 0, and it flips at inflections.
//   Rotation-minimising frame (RMF): no spin about T (ω·T = 0); computed by double reflection (Wang et al. 2008).
//   The two differ by the integrated torsion: twist(Frenet → RMF) = ∫ τ ds.
//   Helix γ(t) = (r cos t, r sin t, c·t), c = pitch/2π:  κ = r/(r² + c²),  τ = c/(r² + c²).
//   loft(P₀, …, Pₙ) interpolates sections; the correspondence between their boundaries decides the twist.
//
// Grounding
//   Rotation-minimising frames by double reflection (Wang, Jüttler, Zheng & Liu 2008); the ISO metric thread
//   profile (ISO 68-1).
//
// Notice
//   - RMF is the default because Frenet breaks on straight segments and S-curves; helices are the exception.
//   - Wrapping the default with a lambda keeps RMF everywhere except where it is the wrong opinion.
//   - Thread profiles are judged against the printer: crest width versus line width, flank overhang versus layer step.
//   - Loft end conditions ('normal') make a lofted duct meet straight collars without a crease.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, lw } from 'jig'

// ── 1. RMF versus Frenet on an S-shaped handle ──────────────────────────────
const path = j.sketch('path', { on: j.plane.XZ })
  .spline('s', [[0, 0], [20, 15], [40, 0], [60, -15], [80, 0]], { fit: 'interp' })   // an inflection at x = 40
const grip = j.sketch('grip', { on: j.plane.normalTo(j.sel.edges().of('path'), { at: 0 }) })
  .rect('r', 12, 6, { center: true, r: 2 })

const handleWith = frame => j.part('handle').sweep(grip.profiles(), path.wire(['s']), { frame, id: 'handle' })
const H1 = j.compile(handleWith('rmf'))
const H2 = j.compile(handleWith('frenet'))

H1.feature('handle').frame       // → { kind: 'rmf', flips: 0, totalTwist: 0°, selfIntersecting: false }
H2.feature('handle').frame       // → { kind: 'frenet', flips: 1, at: [0.5], totalTwist: 180°, selfIntersecting: true }
H2.diagnostics
// → [{ level: 'error', kind: 'brep.invalid', at: 'handle', message: 'sweep self-intersects where the Frenet normal flips (κ = 0 at s = 0.50)',
//      fix: "frame: 'rmf' (the default)" }]

// ── 2. A helix, and the integrated torsion ──────────────────────────────────
const helix = j.sketch3d('coil').helix('h', { axis: j.axis.Z, r: mm(10), pitch: mm(6), turns: 5 })
// c = 6/2π = 0.955 mm   L = 5 · 2π·√(10² + 0.955²) = 315.6 mm   τ = 0.955 / 100.9 = 0.00946 /mm
// ∫ τ ds = 2π · 5 · 0.955 / √100.9 = 2.99 rad = 171°

const square = j.sketch('sq', { on: j.plane.normalTo(j.sel.edges().of('coil'), { at: 0 }) }).rect('r', 2, 2, { center: true })
const springWith = frame => j.part('spring').sweep(square.profiles(), helix.wire(['h']), { frame, id: 'coil' })
j.compile(springWith('rmf')).feature('coil').frame
// → { kind: 'rmf', totalTwist: 171°, note: 'the square section drifts 34.2° per turn relative to the axis' }
j.compile(springWith('frenet')).feature('coil').frame
// → { kind: 'frenet', totalTwist: 0° relative to the axis, note: 'N points at the axis on a helix' }

// Keep the default everywhere, except on helices: a lambda that wraps ctx.default.
const axisAware = (curve, ctx) => (curve.isHelix ? 'frenet' : ctx.default)
const spring = springWith(axisAware)

// ── 3. Printed threads: why the trapezoid prints better ─────────────────────
// A threaded rod and its nut, both with the slide fit class.
const rodWith = (spec, profile) => j.part('rod')
  .extrude(j.sketch('c', { on: j.plane.XY }).circle('c', 6, { at: [0, 0] }).profiles(), mm(30), { id: 'core' })
  .add(j.lib.thread(spec, { length: mm(25), profile, fit: 'slide' }), { at: j.feat('core').sideFaces().expect(1) })

const iso = j.compile(rodWith('M12x1.75', 'iso'))
const tr = j.compile(rodWith('Tr12x3', 'trapezoid'))

iso.feature('thread')
// → { crest: 0.22 mm (P/8), root: 0.44 mm (P/4), depth: 1.07 mm, layersPerPitch: 8.75, flankFromVertical: 60° }
tr.feature('thread')
// → { crest: 1.10 mm (0.366·P), root: 1.10 mm, depth: 1.75 mm, layersPerPitch: 15, flankFromVertical: 75° }

// The crest is the deciding feature on FDM. ISO's crest is narrower than one line width, so the nozzle
// rounds it off and engagement drops. The trapezoid's crest is about 2.4 line widths wide and survives.
j.check(iso, j.rules.fdm).map(d => d.kind)   // → ['print.thinFeature', 'print.overhang']   crest 0.22 mm < nozzle(1); flank 60°
j.check(tr, j.rules.fdm).map(d => d.kind)    // → ['print.overhang']                        flank 75°

// Both lower flanks break the 45° rule, but by different amounts. Each layer steps out by layer·tan θ:
// ISO 0.2·tan 60° = 0.35 mm < lw(1), which usually prints; trapezoid 0.2·tan 75° = 0.75 mm > lw(1), which droops.
// So the trapezoid wins on crests and loses on overhangs. A buttress profile wins on both when oriented:
// a 45° flank facing down and the steep load flank facing up.
const buttress = j.compile(rodWith('Bu12x3', 'buttress'))
buttress.feature('thread').flankFromVertical  // → { lower: 45° (the 45° variant), upper: 87° (faces up, so never an overhang) }
j.check(buttress, j.rules.fdm)                // → []

const nut = j.part('nut')
  .extrude(j.sketch('h', { on: j.plane.XY }).polygon('hex', 6, 10, { at: [0, 0], inscribed: false }).profiles(), mm(10), { id: 'hex' })
  .add(j.lib.thread('Tr12x3', { length: mm(10), internal: true, profile: 'trapezoid', fit: 'slide' }), { at: j.axis.Z, op: 'cut' })
j.compile(nut).feature('thread').modelled
// → { major: 12.9 mm (D4 12.5 + 2 × 0.2), minor: 9.4 mm (D1 9 + 2 × 0.2), flankGap: 0.2 mm per side (slide, uncalibrated) }

// ── 4. A loft with end conditions: a vacuum-hose adapter ────────────────────
const slot = j.sketch('slot', { on: j.plane.XY }).rect('r', 60, 20, { center: true, r: 3 })              // the crevice nozzle end
const round = j.sketch('round', { on: j.plane.offset(j.plane.XY, mm(50)) }).circle('c', 17.5, { at: [0, 0] })   // Ø35 hose end

const adapter = j.part('hose-adapter')
  .loft([slot.profiles(), round.profiles()], { ends: { start: 'normal', end: 'normal' }, id: 'duct' })
  .extrude(slot.profiles(), mm(-10), { id: 'collarA' })                        // straight collars meet the duct tangentially
  .extrude(round.profiles(), mm(15), { id: 'collarB' })
  .shell(j.feat('collarA').endFace().or(j.feat('collarB').endFace()), lw(4), { id: 'walls' })   // 1.8 mm walls, both ends open

const A = j.compile(adapter)
A.feature('duct')
// → { correspondence: 'seam-aligned', twist: 0°, sections: 2, ends: { start: 'normal', end: 'normal' } }
const duct = adapter.rollback('walls')                  // the timeline before shelling: the flow envelope
j.inspect.section(duct, j.plane.XY).area                // → 1'192 mm²  (60·20 − (4 − π)·3²)
j.inspect.section(duct, j.plane.offset(j.plane.XY, mm(50))).area      // → 962 mm²  (π·17.5²): 19 % less flow area
j.inspect.overhang(adapter, { dir: '+Z', max: deg(45) })
// → { faces: [], maxAngle: 14° }   (half-width 30 → 17.5 mm over 50 mm: atan(12.5/50) = 14°; prints without support)
