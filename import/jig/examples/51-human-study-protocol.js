// 51 · A human-study protocol: three modelling paradigms, novices, and a phone stand
//
// Model
//   Paradigm (sketch-first | CSG-first | field-first) is the factor of interest. Task (three phone-stand
//   briefs) and position (1st, 2nd, 3rd) are nuisance factors. A 3 × 3 Graeco-Latin square balances all
//   three: every paradigm meets every task once and every position once across the three sequences.
//   Each participant follows one sequence (within-subject), so participant variance cancels.
//   Logging stores only the model values participants compiled. Compiles are deterministic, so every
//   measure (diagnostics, rule violations, time to spec) can be recomputed later from those values.
//
// Notice
//   - The brief is an objective: j.objective.require over the compiled Program, so "done" is checked identically for everyone.
//   - Errors come from the same diagnostics registry the engine already emits; no hand coding of videos is needed.
//   - The protocol, analysis plan and ethics notes are hashed together before the first participant: that is the pre-registration.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, minute } from 'jig'

// ── 1. The briefs, as executable specs ─────────────────────────────────────
// Participants tag the face the phone rests on with a port named 'phone'.
const phoneAngle = prog => prog.node('port:phone').frame.z.angleTo(j.dir('+Z'))
const briefs = {
  A: j.objective.require([                               // desk stand with a cable slot
    prog => phoneAngle(prog).gte(deg(60)) && phoneAngle(prog).lte(deg(70)),
    prog => prog.find(n => n.kind === 'port' && n.id === 'cable').length === 1,
    j.rules.fdm,
  ]),
  B: j.objective.require([                               // bedside stand, landscape, with a 56 mm charging-puck pocket
    prog => phoneAngle(prog).gte(deg(50)) && phoneAngle(prog).lte(deg(65)),
    prog => prog.node('port:puck') != null,
    j.rules.fdm,
  ]),
  C: j.objective.require([                               // travel stand: fits in an 80 × 60 × 20 mm envelope
    prog => prog.metric('bbox').every((d, i) => d.lte([mm(80), mm(60), mm(20)][i])),
    j.rules.fdm,
  ]),
}

// ── 2. Paradigm starters: what each group sees in the first minute ─────────
const starters = {
  'sketch-first': j.part('stand')
    .extrude(j.sketch('side', { on: j.plane.YZ }).polyline('p', [[0, 0], [70, 0], [20, 60]], { closed: true }).profiles(), { symmetric: mm(35) }),
  'csg-first': j.part('stand')
    .add(j.box(mm(70), mm(70), mm(6)))
    .add(j.box(mm(70), mm(6), mm(80)).moved(j.tx.rotate(j.axis.X, deg(-25)))),
  'field-first': j.part('stand')
    .import(j.mesh(j.field.box(mm(70), mm(70), mm(6)).smoothUnion(j.field.capsule([0, 20, 0], [0, 45, 60], mm(4)), mm(6)))),
}

// ── 3. The design: a Graeco-Latin square ───────────────────────────────────
//              position 1      position 2      position 3
//   seq 1      sketch · A      CSG · B         field · C
//   seq 2      CSG · C         field · A       sketch · B
//   seq 3      field · B       sketch · C      CSG · A
const study = j.experiment({
  hypothesis: [
    'H1: CSG-first reaches a spec-satisfying model faster than sketch-first for novices (median time ratio < 0.8)',
    'H2: field-first produces fewer print-rule violations in final models than sketch-first',
    'H3: sketch-first produces the most sketch.* and ref.* diagnostics per minute',
  ],
  factors: {
    paradigm: ['sketch-first', 'csg-first', 'field-first'],
    task: ['A', 'B', 'C'],
    position: [1, 2, 3],
  },
  responses: {
    timeToSpec: 'duration (censored at 25 min)', success: 'bool', diagnosticsPerMin: 'rate',
    ruleViolations: 'count', printed: 'bool', tlx: 'score 0–100', sus: 'score 0–100',
  },
  design: 'graeco-latin',
  replicates: 8,                                         // 8 participants per sequence → 24 participants
  randomize: { order: 'participants-to-sequences' },
  protocol: {
    eligibility: 'adults; < 10 h prior CAD use (screening questionnaire); have used a 3D printer or want to',
    session: '10 min tutorial per paradigm, then 25 min per task; breaks between tasks; about 2 h in total',
    consent: 'written informed consent; screen recording only with an explicit opt-in; withdraw at any time without giving a reason',
    data: 'pseudonymous ids; logs hold model values and timestamps only; raw recordings deleted after coding; 5-year retention',
    approval: 'institutional ethics approval required before the first session; pilots (n = 3) are excluded from analysis',
    compensation: 'fixed, not contingent on performance',
  },
  seed: 51,
})

study.runs.length                        // → 72 = 24 participants × 3 tasks
study.sequences[1]
// → [{ position: 1, paradigm: 'csg-first', task: 'C' }, { position: 2, paradigm: 'field-first', task: 'A' }, { position: 3, paradigm: 'sketch-first', task: 'B' }]
const preregistration = j.hash(study)    // → 'sha256:51ab…'   (hashes hypotheses, design, protocol and the analysis plan below)

// ── 4. The log: a sequence of model values, nothing else ───────────────────
// The workbench appends { t, model } on every compile. Loading the logs is an effect.
const logs = await j.load.json('data/study51/sessions.json')

const measuresOf = (session, brief) => {
  const progs = session.log.map(e => ({ t: e.t, prog: j.compile(e.model) }))   // recomputed, cached by hash
  const first = progs.find(p => j.evaluate(brief, p.prog).feasible)
  const final = progs[progs.length - 1].prog
  const diags = progs.flatMap(p => p.prog.diagnostics)
  return {
    timeToSpec: first ? first.t : minute(25),
    success: Boolean(first),
    diagnosticsPerMin: diags.length / session.minutes,
    byKind: Object.groupBy(diags, d => d.kind.split('.')[0]),
    ruleViolations: j.check(final, j.rules.fdm).filter(d => d.level !== 'info').length,
    edits: session.log.slice(1).map((e, i) => j.diff(session.log[i].model, e.model)),   // the edit trajectory
    finalModel: session.log[session.log.length - 1].model,
  }
}

const rows = logs.map(s => ({ ...s.cell, ...measuresOf(s, briefs[s.cell.task]) }))
const recorded = study.record(rows)
j.hash(j.compile(logs[0].log[3].model)) === logs[0].log[3].hash   // → true   (recomputing a logged model reproduces it)

// ── 5. The analysis plan (pre-registered with the design) ──────────────────
const analysis = recorded.analyze({
  model: 'mixed',
  formulas: {
    timeToSpec: 'log(timeToSpec) ~ paradigm + task + position + (1 | participant)',   // censored: Tobit at 25 min
    success: 'success ~ paradigm + task + position + (1 | participant)',              // logistic link
    ruleViolations: 'ruleViolations ~ paradigm + task + position + (1 | participant)', // Poisson link
  },
  contrasts: ['csg-first - sketch-first', 'field-first - sketch-first'],
  correction: 'holm',
  exclusions: ['technical failure > 5 min', 'did not attempt a task'],
})
analysis.summary
// → { timeToSpec: { 'csg-first/sketch-first': 0.71 [0.58, 0.87], 'field-first/sketch-first': 0.93 [0.76, 1.14] },
//     ruleViolations: { 'field-first/sketch-first': 0.48 [0.31, 0.74] }, H1: 'supported', H2: 'supported', H3: 'supported' }

// ── 6. Printing the finals: the ground truth the rules only predict ────────
// Every final model is printed once on the same printer (an effect); 'printed' records whether it met the brief physically.
const printJobs = rows.map(r => j.print(`p51-${r.participant}-${r.task}`, { printer: j.printer('mk4'), parts: [r.finalModel] }))
printJobs.length                         // → 72
