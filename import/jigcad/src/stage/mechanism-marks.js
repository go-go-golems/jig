// The Joints overlay (assembly spec v0.1, workbench views): for an assembly, the frames of the ports its joints use
// (x in st-rec, z in st-blue), a glyph per joint (a ring about a revolute's axis, a double arrow along a slider, both
// for a pin in a slot (the arrow along the slot), a
// square for a rigid joint, a disc for a ball, a square in the plane of a planar joint) with its id and solved value,
// the free motions the joints leave (an arc about the axis of a rotation that passes through the component, else
// the velocities the twist gives the component's ports and centre), and the paths of point measures over a study.
// Joints in a conflicting set are drawn in st-rec; driven joints in st-rec too, every other joint in ink.
import { V, applyM } from './math.js';
import { proj } from './camera.js';
import { arrow, line, label } from './furniture.js';

const perp = (n) => V.norm(Math.abs(n[0]) < 0.9 ? V.cross(n, [1, 0, 0]) : V.cross(n, [0, 1, 0]));

export function drawMechanism(ctx, C, state, program) {
  const A = program?.assembly; if (!A) return;
  const { cam } = state, P = (p) => proj(cam, p), L = (px) => px / cam.s;   // a length in mm that draws as px pixels
  const conflict = new Set(A.conflicts || []);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // point measures over each study: their paths, and where they are now
  for (const st of Object.values(A.studies || {})) for (const key of st.keys || []) {
    const pts = (st.rows || []).filter((r) => r.ok && Array.isArray(r[key]) && r[key].length === 3).map((r) => r[key]);
    if (pts.length < 2) continue;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2; ctx.beginPath();
    pts.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.stroke();
    const now = A.measures?.[key];
    if (Array.isArray(now)) { const q = P(now); ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, 7); ctx.fill(); label(ctx, C, key, q, { dx: 7, dy: -7, size: 10, tone: 'accent', bg: true }); }
  }

  // port frames
  for (const pf of A.ports || []) {
    const q = P(pf.o);
    arrow(ctx, q, P(V.add(pf.o, V.mul(pf.x, L(24)))), C.accent, 1.1);
    arrow(ctx, q, P(V.add(pf.o, V.mul(pf.z, L(28)))), C.blue, 1.1);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 7); ctx.fill();
  }

  // joints
  for (const j of A.joints || []) {
    if (!j.at || !j.axis) continue;
    const col = conflict.has(j.id) || j.driven ? C.accent : C.ink;
    const c = j.kind === 'slider' && j.atB ? j.atB : j.at, n = V.norm(j.axis), u = perp(n), v = V.cross(n, u), q = P(c);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
    const ring = (rad) => { ctx.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI * 2, p = P(V.add(c, V.add(V.mul(u, rad * Math.cos(t)), V.mul(v, rad * Math.sin(t))))); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke(); };
    if (j.kind === 'revolute' || j.kind === 'cylindrical' || j.kind === 'pinSlot') ring(L(10));
    if (j.kind === 'pinSlot' && j.slideAxis) { const sx = V.norm(j.slideAxis); arrow(ctx, q, P(V.sub(c, V.mul(sx, L(24)))), col, 1.5); arrow(ctx, q, P(V.add(c, V.mul(sx, L(24)))), col, 1.5); }
    if (j.kind === 'slider' || j.kind === 'cylindrical') { arrow(ctx, q, P(V.sub(c, V.mul(n, L(24)))), col, 1.5); arrow(ctx, q, P(V.add(c, V.mul(n, L(24)))), col, 1.5); }
    if (j.kind === 'rigid' || j.kind === 'snap') ctx.strokeRect(q[0] - 4.5, q[1] - 4.5, 9, 9);
    if (j.kind === 'ball') { ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(q[0], q[1], 2.5, 0, 7); ctx.fill(); }
    if (j.kind === 'planar') { ctx.beginPath(); [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]].forEach(([a, b], i) => { const p = P(V.add(c, V.add(V.mul(u, L(13) * a), V.mul(v, L(13) * b)))); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke(); }
    const vv = Math.abs(+j.value) < 0.005 ? 0 : +j.value, val = j.value == null ? '' : ` ${vv.toFixed(j.unit === 'mm' ? 2 : 1)}${j.unit === 'mm' ? ' mm' : '°'}`;
    label(ctx, C, `${j.id}${val}`, q, { dx: j.kind === 'slider' ? -12 : 12, dy: j.kind === 'slider' ? 14 : -10, align: j.kind === 'slider' ? 'right' : 'left', size: 10, tone: conflict.has(j.id) || j.driven ? 'accent' : 'ink', bg: true });
  }

  // free motions: what the joints leave before the drives (or after them, when some remain)
  const M = A.mobility || {};
  const sets = A.assembled ? (M.left > 0 && M.drives ? null : M.drives ? [] : M.free) : [];
  const cols = [C.green, C.violet, C.amber, C.teal, C.blue];
  (sets || []).forEach((tw, k) => {
    const col = cols[k % cols.length]; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.7;
    const vels = [];
    for (const t of tw) {
      const origin = A.origins?.[t.body]; if (!origin) continue;
      const insts = state.scene.instances.filter((i) => i.body.part === t.body);
      const cen = insts.length ? V.mul(insts.reduce((a, i) => V.add(a, V.mul(V.add(i.box[0], i.box[1]), 0.5)), [0, 0, 0]), 1 / insts.length) : origin;
      const size = insts.length ? 0.5 * Math.max(...insts.map((i) => V.len(V.sub(i.box[1], i.box[0])))) : 20;
      const wl = V.len(t.w);
      if (wl > 1e-6) {
        const nn = V.mul(t.w, 1 / wl), a0 = V.add(origin, V.mul(V.cross(t.w, t.v), 1 / (wl * wl)));
        const foot = V.add(a0, V.mul(nn, V.dot(V.sub(cen, a0), nn))), d = V.len(V.sub(cen, foot));
        if (d < 0.6 * size) {
          const rad = Math.max(L(28), d * 0.8), u = perp(nn), v = V.cross(nn, u);
          const at = (th) => P(V.add(foot, V.add(V.mul(u, rad * Math.cos(th)), V.mul(v, rad * Math.sin(th)))));
          ctx.beginPath(); for (let i = 0; i <= 36; i++) { const q = at(0.3 + i / 36 * 4.6); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke();
          arrow(ctx, at(4.75), at(4.95), col, 1.7);
          line(ctx, P(V.sub(foot, V.mul(nn, L(34)))), P(V.add(foot, V.mul(nn, L(34)))), col, 1, [4, 3]);
          continue;
        }
      }
      const pts = (A.ports || []).filter((pf) => pf.ref.split(':')[0] === t.body).map((pf) => pf.o).concat([cen]);
      for (const p of pts) vels.push([p, V.add(V.cross(t.w, V.sub(p, origin)), t.v)]);
    }
    const vmax = Math.max(...vels.map(([, v]) => V.len(v)), 1e-12);
    for (const [p, vel] of vels) if (V.len(vel) > 0.04 * vmax) arrow(ctx, P(p), P(V.add(p, V.mul(vel, L(44) / vmax))), col, 1.7);
  });
  ctx.restore();
  void applyM;
}
