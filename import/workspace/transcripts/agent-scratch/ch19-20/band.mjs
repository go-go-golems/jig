import { build, oc, K, r6 } from './lib.mjs';
const prog = await build(`return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })`);
const b = prog.kernelBodies()[0].body;
const ei = b.edgeNames.findIndex(n => n === 'hub/side[circle] ∩ disc/end');
function bad(R) {
  const mk = new oc.BRepFilletAPI_MakeFillet(b.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  mk.Add(R, b.edges.list[ei]);
  try { mk.Build(new oc.Message_ProgressRange()); if (!mk.IsDone()) return 'notdone';
    const s = mk.Shape(); const lost = b.faces.list.some(f => mk.IsDeleted(f)); const v = K.isValid(s); const n = K.countSub(s, 'FACE'); s.delete();
    return `${lost ? 'LOST' : 'kept'} valid=${v} faces=${n}`;
  } catch (e) { return 'threw'; } finally { mk.delete(); }
}
for (const d of [1e-3, 1e-4, 1e-5, 1e-6, 2e-7, 1e-7, 5e-8, 1e-8, 1e-9, 0]) console.log(`1-${d}: ${bad(1 - d)}   1+${d}: ${bad(1 + d)}`);
