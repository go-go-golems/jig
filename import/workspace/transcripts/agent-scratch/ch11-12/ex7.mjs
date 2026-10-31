import { sketch, c, deg, analyse, rowsOf, fmt } from './h.mjs';
const show = (label, sk) => {
  const A = analyse(sk), S = A.solved;
  console.log('==', label); console.log(S.ir().split('\n').slice(1, 4).join('\n'));
  for (const d of S.diagnostics) console.log('  ', d.level, d.kind, d.message, d.fix ? '· fix: ' + d.fix : '');
  for (const cl of A.clusters) console.log('   entityDof', [...cl.entityDof].map(([k, v]) => `${k}:${v}`).join(' '));
  return A;
};
// (a) triangle with three lengths
const tri = sketch('tri').polyline('t', [[0, 0], [40, 0], [40, 30]], { closed: true })
  .dim('t.1', 40).dim('t.2', 30).dim('t.3', 50);
const A = show('triangle lengths', tri);
// rigid motions: J t = 0 ?
const cl = A.clusters[0], X = A.X;
const J = rowsOf(cl.J, cl.m, cl.n);
const mk = f => cl.cols.map(i => f(A.sys.pname[i], i));
const tx = mk(nm => /\.(ax|bx)$/.test(nm) ? 1 : 0), ty = mk(nm => /\.(ay|by)$/.test(nm) ? 1 : 0);
const rot = mk((nm, i) => { const k = nm.split('.').pop(); const pair = { ax: 'ay', bx: 'by', ay: 'ax', by: 'bx' }[k]; const j = A.sys.pname.indexOf(nm.replace(/[ab][xy]$/, pair)); return k.endsWith('x') ? -X[j] : X[j]; });
for (const [nm, t] of [['tx', tx], ['ty', ty], ['rot', rot]]) console.log('  |J·' + nm + '| =', Math.max(...J.map(r => Math.abs(r.reduce((s, v, k) => s + v * t[k], 0)))).toExponential(2));
show('triangle anchored', tri.constrain(c.fix('t.1.start'), c.horizontal('t.1')));
// (g) the L of chapter 11 without the length of l1
show('L without length l1', sketch('L').line('l1', [0, 0], [40, 0]).line('l2', 'l1.end', [40, 30])
  .constrain(c.fix('l1.start'), c.horizontal('l1'), c.perpendicular('l1', 'l2')).dim('l2', 30));
// (h) chapter 3 outline
show('ch3 outline', sketch('outline').polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'), c.vertical('p.4'), c.horizontal('p.5'), c.vertical('p.6'))
  .dim('p.1', 60));
