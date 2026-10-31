// node /tmp/ch13-14/repro.mjs  — minimal repros for the ch13/14 issues
import { compile } from './lib.mjs';
const show = async (title, code) => {
  const r = await compile(code); const p = r.program;
  console.log('==', title);
  for (const d of p.decisions.filter(d => d.kind === 'solver')) console.log('  decision', d.chose, '·', d.reason);
  for (const d of p.diagnostics.filter(d => d.level === 'error')) console.log('  ', d.kind, d.message, '· fix:', d.fix);
};
const tri = (apex, extra = '') => `return j.sketch('tri', { on: j.plane.XY })
  .polyline('t', [[0, 0], [60, 0], ${apex}], { closed: true })
  .constrain(j.c.fix('t.1')).dim('t.2', 35).dim('t.3', 40)${extra}`;
// 1. consistent triangle (two solutions, apex (33.125, ±22.42)) reported as "no solution"
await show('1a degenerate start: apex drawn on the base line', tri('[30, 0]'));
await show('1b iteration cap too small', tri('[30, 30]', '.solver(j.solver.lm({ maxIter: 3 }))'));
// 2. two independent conflicts: the first set contains dim(p.6), dim(p.2) (y-chain); dropping either does not fix the x-conflict
const out = `j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(j.c.fix('p.1.start'), j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))`;
await show('2a two conflicts', `return ${out}.dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8).dim('p.3', 50).dim('p.4', 30)`);
await show('2b same without dim(p.6): x-conflict remains', `return ${out}.dim('p.1', 60).dim('p.2', 8).dim('p.5', 8).dim('p.3', 50).dim('p.4', 30)`);
// 3. a one-constraint "minimal conflicting set"
await show('3 perpendicular on two horizontal lines', `return ${out}.dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8).constrain(j.c.perpendicular('p.1', 'p.3'))`);
// 4. set omits horizontal(p.1), whose removal also fixes the sketch (p.1 tilts to (58, 15.36))
await show('4a conflict', `return ${out}.dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8).dim('p.3', 50)`);
await show('4b same without horizontal(p.1): solves', `return ${out.replace("j.c.horizontal('p.1'), ", '')}.dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8).dim('p.3', 50)`);
// 5. 'bfgs' runs LM but is reported as bfgs
await show('5 bfgs', tri('[30, 30]', ".solver('bfgs')"));
