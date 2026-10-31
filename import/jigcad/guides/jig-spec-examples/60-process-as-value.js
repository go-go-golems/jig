// 60 · The design process as a value
//
// Model
//   A process is a builder like any other: an immutable sequence of steps, built with
//   step (a pure transform), diverge (make n alternatives), critique (filter with rules or a lambda),
//   converge (rank with an objective and keep the best), print and measure (effects), and loop (repeat until a condition holds).
//   Processes compose with then, like feature timelines. They hash, diff and cache, so a changed tail reruns alone.
//   Running it needs effect handlers for print and measure. Recorded effects can be replayed,
//   which makes a whole design session reproducible.
//
// Notice
//   - Only the print and measure steps touch the world. Re-running a process after a change recomputes only the steps downstream of it.
//   - Two processes can be compared with j.diff, just like two models.
//   - A replayed run is exactly reproducible. That turns design sessions into data for 61.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, lw } from 'jig'

// ── 1. The object family: a rail hook, parametric ─────────────────────────
const hook = ({ t = lw(6), reach = mm(35) } = {}) => j.part('rail-hook')
  .params({ rail: mm(20), t, reach, width: mm(16) })
  .extrude(j.sketch('side', { on: j.plane.XZ })
    .line('back', [0, 0], [0, 26]).line('top', 'back.end', [24, 26]).line('lip', 'top.end', [24, 18])   // the J over the rail
    .line('stem', 'back.start', [0, -30]).line('arm', 'stem.end', [35, -30]).line('tip', 'arm.end', [35, -22])
    .dim('top', 'rail + t').dim('arm', 'reach')
    .offset('body', ['back', 'top', 'lip', 'stem', 'arm', 'tip'], 't')
    .profiles(), { symmetric: 'width' }, { id: 'body' })
  .fillet(j.sel.edges('|Y').where(e => e.concave), mm(3), { id: 'roots' })
  .use(j.preset.functional)

// ── 2. The process ─────────────────────────────────────────────────────────
const brief = { rail: mm(20), load: 'two coats', printer: 'mk4', material: 'PETG' }

const conceptFirst = j.process
  .step('frame', b => ({ brief: b, fit: 'mk4-petg' }))
  .diverge(6, (ctx, i) => hook({ t: lw(5 + (i % 3)), reach: mm(30 + 5 * Math.floor(i / 3)) }).fit(ctx.fit))
  .critique(j.rules.fdm)                                          // concepts with rule errors are dropped, with reasons
  .converge(j.objective.lexicographic([j.objective.minimize('layerStrengthRisk'), j.objective.minimize('printTime')]))
  .step('coupon', model => ({ model, coupon: j.fit.coupon({ kind: 'slot', range: [mm(0.1), mm(0.4)], steps: 4 }) }))
  .print(c => c.coupon)                                           // effect: print only the coupon first
  .measure({ snapsOnRail: ['tight', 'good', 'loose'], bestSlot: 'index' })
  .step('calibrate', (c, ctx) => c.model.override({ rail: mm(20).add(ctx.measured.bestSlotClearance) }))
  .loop(j.process.print(m => m).measure({ holds: 'bool', wobble: 'bool' }), { until: r => r.holds && !r.wobble, max: 3 })

j.hash(conceptFirst)                      // → 'sha256:60c3…'
conceptFirst.steps.map(s => s.kind)
// → ['step', 'diverge', 'critique', 'converge', 'step', 'print', 'measure', 'step', 'loop']

// ── 3. Running it: effects are handlers you pass in ─────────────────────────
const effects = {
  print: async prog => j.export.tmf(prog).data,                   // hand the 3MF to your printer or print queue
  measure: async form => (await j.load.json('data/hook-measurements.json'))[form.id],   // or a form on your phone
}
const run1 = await j.process.run(conceptFirst, { input: brief, effects, seed: 60 })
run1.trace
// → [{ step: 'diverge', made: 6 },
//    { step: 'critique', kept: 4, dropped: [{ i: 0, kind: 'print.thinWall' }, { i: 3, kind: 'print.overhang' }] },
//    { step: 'converge', chose: 5, scores: [[0.08, 52], [0.11, 47], …] },
//    { step: 'print', what: 'coupon', minutes: 14 }, { step: 'measure', bestSlot: 2 },
//    { step: 'loop', iterations: 2, until: 'holds && !wobble' }]
run1.metrics
// → { prints: 3, printMinutes: 116, filament: 38.7 g, designerMinutes: 22 }   (coupon 14 min + 2 hooks × 51 min)

// ── 4. Change one step: only its downstream cone reruns ────────────────────
const stiffer = conceptFirst.with(p => p.replace('converge',
  j.objective.weighted({ risk: ['layerStrengthRisk', 10], time: ['printTime', 0.05] })))
const run2 = await j.process.run(stiffer, { input: brief, effects: run1.replay() })   // replay recorded measurements
run2.trace.map(t => [t.step, t.cached])
// → [['frame', true], ['diverge', true], ['critique', true], ['converge', false], ['coupon', false], …]
j.hash(run2.value) === j.hash(run1.value)   // → false: the weighted objective picked concept 4 instead of 5

// ── 5. Processes are comparable values ─────────────────────────────────────
const couponFirst = j.process
  .step('frame', b => ({ brief: b, fit: 'mk4-petg' }))
  .step('coupon', c => ({ ...c, coupon: j.fit.coupon({ kind: 'slot', range: [mm(0.1), mm(0.4)], steps: 4 }) }))
  .print(c => c.coupon)
  .measure({ snapsOnRail: ['tight', 'good', 'loose'], bestSlot: 'index' })
  .diverge(6, (ctx, i) => hook({ t: lw(5 + (i % 3)), reach: mm(30 + 5 * Math.floor(i / 3)) }).fit(ctx.fit))
  .critique(j.rules.fdm)
  .converge(j.objective.lexicographic([j.objective.minimize('layerStrengthRisk'), j.objective.minimize('printTime')]))
  .loop(j.process.print(m => m).measure({ holds: 'bool', wobble: 'bool' }), { until: r => r.holds && !r.wobble, max: 3 })

j.diff(conceptFirst, couponFirst)
// → { moved: [{ step: 'coupon', from: 5, to: 2 }, { step: 'print(coupon)', from: 6, to: 3 }, { step: 'measure', from: 7, to: 4 }],
//     removed: ['calibrate'], added: [], note: 'fit known before concepts: diverge sees the calibrated clearance' }

// ── 6. Composing processes reuses work ─────────────────────────────────────
// then concatenates processes, and grouping doesn't matter, so a run of a.then(b).then(c) can reuse a cached
// run of a.then(b) when only c changed. A print can't be undone, so there is nothing more to the algebra than that.
const a = j.process.step('x', v => v), b = j.process.critique(j.rules.fdm), c = j.process.converge(j.objective.minimize('mass'))
j.hash(a.then(b).then(c)) === j.hash(a.then(b.then(c)))          // → true
const c2 = j.process.converge(j.objective.minimize('printTime'))
(await j.process.run(a.then(b).then(c2), { input: brief, effects })).trace.map(t => [t.step, t.cached])
// → [['x', true], ['critique', true], ['converge', false]]   (only the changed tail runs)
