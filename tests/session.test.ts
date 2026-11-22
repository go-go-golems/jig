// tests/session.test.ts — SceneSession (src/engine/session.ts) against known answers (CANDELA-002 design doc 02, §5.2).
//
//   npx tsx tests/session.test.ts
//
// W-01's behaviours are closed-form (a bouncing ball, a spinning top, a pendulum), so stepping the session at 24 fps
// and reading the object matrices back out of `pack` checks the whole chain: behaviour callbacks → overrides →
// transform recipes → packed object records. K-09 checks that a session packs exactly what the viewport packs, and
// two sessions check determinism.
import { loadCatalogFromDisk } from '../src/content/node';
import { SceneSession } from '../src/engine/session';
import { inv34 } from '../src/engine/compile';
import { digestBytes, packDigest } from '../src/engine/digest';

let failures = 0;
const check = (cond: boolean, what: string) => { if (!cond) { failures++; console.log('  FAIL ' + what); } };
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps;
const presets = loadCatalogFromDisk().presets;
const filesOf = (id: string) => presets.find(p => p.id === id)!.files;

/** object-to-world translation of the object with this id, read back from the packed object records */
function worldPos(s: SceneSession, P: any, id: string): number[] {
  const objs = s.compiled.objects as any[];
  for (let k = 0; k < P.nObjs; k++) {
    const oi = P.O[k * 24 + 21];
    if (objs[oi] && objs[oi].id === id) { const M = inv34(Array.from(P.O.subarray(k * 24 + 4, k * 24 + 16))); return [M[3], M[7], M[11]]; }
  }
  throw new Error(`no object #${id}`);
}
function rotYZ(s: SceneSession, id: string) { const st = s.beh.anim.get(id)!; return [st.rot[1], st.rot[2]]; }

// ---- W-01: behaviours ----
{
  const s = new SceneSession();
  const r = await s.build(filesOf('W-01'));
  check(r.ok, 'W-01 builds');
  check(s.behaviors.length === 3, `W-01 has 3 behaviours (got ${s.behaviors.length})`);
  const g = 9.81, h0 = 1.0, T = Math.sqrt(8 * h0 / g), L = 0.9, dt = 1 / 24;
  s.seek(0, 0);
  let maxErr = 0;
  for (let f = 1; f <= 48; f++) {
    const t = f * dt;
    s.seek(t, dt);
    const P = s.pack();
    const ball = worldPos(s, P, 'ball'), bob = worldPos(s, P, 'bob');
    const sB = (t % T) - T / 2, th = 0.5 * Math.cos(Math.sqrt(g / L) * t);
    const want = { ballY: 0.18 + h0 - 0.5 * g * sB * sB, bobX: 1.2 + L * Math.sin(th), bobY: 1.9 - L * Math.cos(th) };
    maxErr = Math.max(maxErr, Math.abs(ball[1] - want.ballY), Math.abs(bob[0] - want.bobX), Math.abs(bob[1] - want.bobY));
    const [ry, rz] = rotYZ(s, 'top');
    check(near(ry, f * dt * 8, 1e-9) && near(rz, 0.15 * Math.sin(t * 1.3), 1e-9), `W-01 top rotation at frame ${f}`);
  }
  check(maxErr < 1e-5, `W-01 ball/pendulum positions within 1e-5 (max error ${maxErr.toExponential(2)})`);
  console.log(`W-01: 48 frames stepped, max position error ${maxErr.toExponential(2)}`);
  // seeking backwards with dt = 0 resets behaviour state, then runs the behaviours once with dt = 0 (as Host.seek)
  s.seek(0, 0);
  check(near(rotYZ(s, 'top')[0], 0, 1e-12), 'W-01 seek back to 0 resets the top\'s accumulated rotation');
  s.seek(dt, dt);
  check(near(rotYZ(s, 'top')[0], dt * 8, 1e-12), 'W-01 top rotation restarts after reset');
  check(s.errors.length === 0, `W-01 behaviours raised no errors (${s.errors.join('; ')})`);
}

// ---- K-09: a session packs what the viewport packs (animation poses, motion samples, seed 0) ----
{
  const s = new SceneSession();
  await s.build(filesOf('K-09'));
  for (const t of [0, 0.37, 1.5]) {
    s.seek(t, 0);
    const P = s.pack();
    const viewport = packDigest(s.compiled, s.compiled.animation, t);
    const mine: Record<string, string> = {};
    for (const k of ['U', 'O', 'LI', 'BV', 'SDs', 'SDd']) mine[k] = digestBytes(P[k]);
    const bad = Object.keys(mine).filter(k => mine[k] !== viewport[k]);
    check(!bad.length, `K-09 session pack equals viewport pack at t=${t} (differs: ${bad.join(', ')})`);
  }
  console.log('K-09: session pack = viewport pack at t = 0, 0.37, 1.5');
}

// ---- determinism: two sessions, same seed, same steps ----
{
  const run = async (seed: number) => {
    const s = new SceneSession({ seed });
    await s.build(filesOf('D-02'));
    return digestBytes(s.pack(0).O);
  };
  const a = await run(3), b = await run(3), c = await run(4);
  check(a === b, 'D-02: same seed → same objects');
  check(a !== c, 'D-02: different seed → different objects');
  console.log(`D-02: seed 3 → ${a} twice; seed 4 → ${c}`);
}

console.log(failures ? `session: ${failures} failure(s)` : 'session: all checks passed');
process.exit(failures ? 1 : 0);
