import { sketch, c, problem } from './core.mjs';
const SI = await import('./solver_inst.js');
const which = process.argv[2] ?? 'outline';
globalThis.__NONARROW = process.argv[3] === 'nonarrow';
const sks = {
  outline: sketch('outline').polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
    .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'),
      c.vertical('p.4'), c.horizontal('p.5'), c.vertical('p.6'))
    .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8).dim('p.3', 50),
  tri: sketch('tri').polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
    .constrain(c.fix('t.1')).dim('t.2', 20).dim('t.3', 30),
};
const sk = sks[which];
const sys = sk.system();
const t0 = performance.now();
const run = SI.solveSketch(sys, {});
const ms = performance.now() - t0;
for (const [k, r] of run.results.entries()) {
  console.log('cluster', k, 'conflicts', JSON.stringify(r.conflicts), 'used', r.used, 'iters', r.iters, 'res', r.residual, 'rank', r.rank, 'dof', r.dof);
}
console.log('MC', globalThis.__MC, 'total ms', ms.toFixed(1));
for (const [i, t] of (globalThis.__TESTS || []).entries()) console.log(i, t.filter(x => !x.startsWith('coincident')).join(', '), `(+${t.filter(x => x.startsWith('coincident')).length} coincident)`);
