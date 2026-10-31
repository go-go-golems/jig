import { build, tally, K, oc, surfType } from './base.mjs';
const cases = {
  filletStraight: `return j.part('p').extrude(j.region.rect(40, 30), mm(10), { id: 'b' }).fillet(j.feat('b').sideFaces().edges('|Z'), mm(4), { id: 'r' })`,
  filletCircular: `return j.part('p').extrude(j.region.rect(40, 30), mm(5), { id: 'b' }).extrude(j.region.circle(6).on(j.plane.offset(j.plane.XY, mm(5))), mm(10), { id: 'peg' }).fillet(j.feat('peg').endFace().edges(), mm(2), { id: 'r' })`,
  filletRoot: `return j.part('p').extrude(j.region.rect(40, 30), mm(5), { id: 'b' }).extrude(j.region.circle(6).on(j.plane.offset(j.plane.XY, mm(5))), mm(10), { id: 'peg' }).fillet(j.feat('peg').startFace().edges(), mm(1), { id: 'r' })`,
  filletTopAll: `return j.part('p').extrude(j.region.rect(40, 30), mm(10), { id: 'b' }).fillet(j.feat('b').sideFaces().edges('|Z'), mm(4), { id: 'r1' }).fillet(j.feat('b').endFace().edges(), mm(2), { id: 'r2' })`,
  chamferCircle: `return j.part('p').extrude(j.region.circle(10), mm(10), { id: 'b' }).chamfer(j.feat('b').endFace().edges(), mm(1), { id: 'c' })`,
  ellipse: `const sk = j.sketch('e', { on: j.plane.XY }).ellipse('e', 10, 6)\nreturn j.part('p').extrude(sk.profiles(), mm(5), { id: 'b' })`,
  taperSquare: `return j.part('p').extrude(j.region.rect(30, 30), mm(20), { taper: deg(-10), id: 'f' })`,
  taperCircle: `return j.part('p').extrude(j.region.circle(10), mm(20), { taper: deg(-10), id: 'f' })`,
  twist: `return j.part('p').extrude(j.region.rect(20, 10), mm(30), { twist: deg(90), id: 't' })`,
  loft: `const a = j.sketch('a', { on: j.plane.XY }).rect('r', 30, 30, { center: true })\nconst b = j.sketch('b', { on: j.plane.offset(j.plane.XY, mm(30)) }).circle('c', 10)\nreturn j.part('p').loft([a.profiles(), b.profiles()], { id: 'l' })`,
  loftRuled: `const a = j.sketch('a', { on: j.plane.XY }).rect('r', 30, 30, { center: true })\nconst b = j.sketch('b', { on: j.plane.offset(j.plane.XY, mm(30)) }).rect('r', 16, 16, { center: true })\nreturn j.part('p').loft([a.profiles(), b.profiles()], { ruled: true, id: 'l' })`,
  sweepHelix: `const wire = j.sketch('c', { on: j.plane.XZ }).circle('w', 1, { at: [10, 0] })\nconst path = j.sketch3d('path').helix('h', { pitch: mm(4), turns: 3, r: mm(10) })\nreturn j.part('coil').sweep(wire.profiles(), path, { id: 'wire' })`,
  countersink: `return j.part('p').extrude(j.region.rect(30, 30), mm(6), { id: 'b' }).hole([[0, 0]], j.hole.countersink('M3', {}), { id: 'h' })`,
  thread: `return j.part('p').add(j.lib.thread('M8', { length: mm(10) }), { id: 't' })`,
  revolveSpline: `const sk = j.sketch('s', { on: j.plane.XZ }).line('a', [0, 0], [10, 0]).spline('b', [[10, 0], [6, 10], [8, 20]]).line('c', [8, 20], [0, 20]).line('d', [0, 20], [0, 0])\nreturn j.part('p').revolve(sk.profiles(), j.axis.Z, turn(1), { id: 'v' })`,
  shellSphere: `return j.part('p').add(j.sphere(mm(10)), { id: 's' })`,
};
for (const [k, code] of Object.entries(cases)) {
  try {
    const t0 = performance.now();
    const { bodies, data } = await build(code);
    const ms = performance.now() - t0;
    const out = bodies.map(b => tally(b));
    const errs = data.diagnostics.filter(d => d.level === 'error').map(d => d.kind + ': ' + d.message);
    console.log(k.padEnd(15), ms.toFixed(0).padStart(5) + ' ms', JSON.stringify(out.map(o => o.surf)), JSON.stringify(out.map(o => o.kind)), 'vol', data.summary.volume, errs.join('; '));
    // fillet surfaces: rational?
    for (const b of bodies) b.faces.list.forEach((f, i) => { if (surfType(f) === 'BSplineSurface' && /fillet|^r|r1|r2|wire|l\//.test(b.names[i])) { const ad = new oc.BRepAdaptor_Surface(f, true); const h = ad.BSpline(); const s = h.get ? h.get() : h; console.log('     ', b.names[i], 'deg', s.UDegree(), s.VDegree(), 'poles', s.NbUPoles(), 'x', s.NbVPoles(), 'rational', s.IsURational(), s.IsVRational()); ad.delete(); } });
  } catch (e) { console.log(k, 'ERR', e.message); }
}
