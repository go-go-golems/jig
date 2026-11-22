import { scene, shape, material, light, camera, mesh, hdri, fx, params, param, units as u } from 'candela';
import D from './lib/lockstitch-data.js';

// The lockstitch head from jig: 27 parts tessellated by OpenCascade (with their B-rep faces), moved by the kine
// rig baked at 1° — the same data the original animation page plays, converted to metres and y up by
// tools/lockstitch/convert.py. Each scene of the original is a choice here; the motion is `animation(t)`.
const SCENES = {
  'S-01 Needle bar': { parts: ['crank', 'nbLink', 'needleBar', 'needle', 'gate', 'gateBracket', 'needlePlate', 'handwheel'], view: 'axo', focus: [[-20, -20, -175], [60, 30, 70]] },
  'S-02 Take-up lever': { parts: ['crank', 'nbLink', 'takeupLever', 'takeupLink', 'takeupStud', 'needleBar', 'gate', 'gateBracket'], view: 'side', focus: [[-10, -85, -110], [40, 25, 50]] },
  'S-03 Rotary hook': { parts: ['hook', 'hookGear', 'bobbinCase', 'bobbin', 'finger', 'lowerShaft', 'lowerGear', 'needle', 'needleBar'], view: 'axo', focus: [[-22, -16, -205], [26, 34, -150]] },
  'S-04 Four-motion feed': { parts: ['feedBar', 'lowerShaft', 'strap', 'rockShaft', 'lowerGear', 'needle', 'needleBar'], view: 'axo', focus: [[-8, -12, -215], [45, 58, -152]] },
  'S-05 Thread path': { parts: ['tension', 'checkSpring', 'guides', 'takeupLever', 'takeupLink', 'takeupStud', 'crank', 'nbLink', 'needleBar', 'needle', 'gate', 'gateBracket', 'needlePlate', 'presser'], view: 'axo', focus: [[-20, -70, -165], [50, 20, 45]] },
  'S-06 Zigzag': { parts: ['gate', 'gateBracket', 'needleBar', 'needle', 'nbLink', 'crank', 'needlePlate'], view: 'axo', focus: [[-18, -16, -162], [22, 24, -80]], zigzag: true, cloth: 'zigzag' },
  'S-07 Whole head': { parts: Object.keys(D.parts), view: 'axo', focus: [[-20, -66, -222], [176, 60, 46]], cloth: 'straight', zoom: 0.95 },
};
const P = params({
  scene: param.choice(Object.keys(SCENES), 'S-07 Whole head').label('Scene'),
  stitch: param.float(2).range(0.25, 8).label('Seconds per stitch'),
  ev: param.ev(9.6).range(6, 14).label('Exposure (EV₁₀₀)'),
  orbit: param.float(0).range(-90, 90).label('Camera orbit (° per stitch)'),
});
const S = SCENES[P.scene.value];

// ---- the data: base64 → typed arrays → mesh definitions (one per body), bodies grouped per part ----
const bytes = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
const body = (part, b, k) => {
  const q = new Int16Array(bytes(b.p)), qn = new Int16Array(bytes(b.nrm)), positions = new Float32Array(b.n * 3), normals = new Float32Array(b.n * 3);
  for (let i = 0; i < b.n * 3; i++) { const c = i % 3; positions[i] = b.lo[c] + (q[i] + 32768) / 65535 * (b.hi[c] - b.lo[c]); normals[i] = qn[i] / 32767; }
  return mesh.fromArrays({ positions, normals, indices: new Uint16Array(bytes(b.i)), faceIds: new Uint16Array(bytes(b.f)),
    faces: b.faces.map(([id, meta]) => ({ id, meta })), name: D.parts[part].bodies.length > 1 ? `${part} ${k + 1}` : part, meta: D.parts[part].meta });
};
const partNode = name => scene.group(D.parts[name].bodies.map((b, k) => shape.mesh(body(name, b, k)).autoFinish())).id(name);

// ---- the rig: a joint's frame at a shaft angle, interpolated between the 1° samples ----
const RIG = { turn: Object.assign({ a: new Float32Array(bytes(D.rig.turn.data)) }, D.rig.turn), zz: Object.assign({ a: new Float32Array(bytes(D.rig.zz.data)) }, D.rig.zz) };
function frameAt(joint, deg) {
  const R = S.zigzag && RIG.zz.joints.includes(joint) ? RIG.zz : RIG.turn, nj = R.joints.length, j = R.joints.indexOf(joint);
  const d = ((deg % R.span) + R.span) % R.span, x = Math.min(R.n - 1.000001, d), i = Math.floor(x), t = x - i, a = R.a;
  const o0 = (i * nj + j) * 7, o1 = ((i + 1) * nj + j) * 7;
  const s = a[o0 + 3] * a[o1 + 3] + a[o0 + 4] * a[o1 + 4] + a[o0 + 5] * a[o1 + 5] + a[o0 + 6] * a[o1 + 6] < 0 ? -1 : 1;
  return { position: [0, 1, 2].map(k => a[o0 + k] + (a[o1 + k] - a[o0 + k]) * t), quaternion: [3, 4, 5, 6].map(k => a[o0 + k] + (s * a[o1 + k] - a[o0 + k]) * t) };
}
// the cloth moves with the feed dog while the dog is above the plate: its travel per degree, two turns
const CLOTH = new Float32Array(bytes(D.cloth.data)), ST = D.cloth.stitch, WRAP = 40;      // a fresh length of cloth every 40 stitches
const clothAt = deg => { const n = Math.floor(deg / 360), d = deg - 360 * n, i = Math.min(359, Math.floor(d)); return n * ST + CLOTH[i] + (CLOTH[i + 1] - CLOTH[i]) * (d - i); };

const moving = S.parts.filter(p => D.parts[p] && D.parts[p].joint);
export const animation = t => {
  const deg = (t / P.stitch.value) * 360, out = {};
  for (const p of moving) out[p] = frameAt(D.parts[p].joint, deg);
  if (S.cloth) out.cloth = { position: [0, 0, -clothAt(deg % (WRAP * 360))] };
  return out;
};

// ---- cloth: a twill weave, and the seam sewn so far (a stitch appears when the needle goes in at 274°) ----
let cloth = null;
if (S.cloth) {
  const top = D.GEO.fabricTop, bot = D.GEO.plateTop, zx = D.events.zigzagX, needleIn = D.events.needleIn;
  const seam = fx.pattern(p => {
    const z = p.local.z, k = z.div(ST).floor(), f = z.div(ST).fract();
    // stitch k joins penetrations k and k+1; it is there once the needle has gone in for k + 1
    const deg = p.time.div(P.stitch).mul(360).mod(WRAP * 360);
    const sewn = k.add(1).mul(360).sub(360 - needleIn).lte(deg).and(k.gte(1));
    const x0 = S.cloth === 'zigzag' ? k.mod(2).mul(zx[1] - zx[0]).add(zx[0]) : fx.float(0);
    const x1 = S.cloth === 'zigzag' ? k.add(1).mod(2).mul(zx[1] - zx[0]).add(zx[0]) : fx.float(0);
    const xl = fx.mix(x0, x1, f), d = p.local.x.add(0.011).sub(xl).abs();        // the box sits at x = 11 mm
    const line = fx.smoothstep(0.00028, 0.00016, d).mul(fx.smoothstep(0.02, 0.09, f)).mul(fx.smoothstep(0.98, 0.91, f));
    return fx.select(sewn, line, 0);
  });
  const weave = fx.pattern(p => fx.sin(p.local.x.add(p.local.z).mul(9000)).mul(0.08).add(0.92));   // a soft twill, 0.7 mm
  const fabric = material.pbr().baseColor(fx.mix(fx.color('#24446e').mul(weave), fx.color('#e9e3d2'), seam)).roughness(0.85).sheen(0.7).sheenColor('#9db4d6');
  cloth = scene.group([shape.box(0.07, top - bot, 0.28).at(0.011, (top + bot) / 2, 0).material(fabric)]).id('cloth');
}

// ---- the view: the original's direction, framed on its region (CAD mm → metres, y up) ----
const VIEWS = { axo: [38, 27], side: [-80, 8], front: [0, 0] };          // side: a few degrees off the elevation, for depth
const cad = ([x, y, z]) => [x / 1000, z / 1000, -y / 1000];
const [yaw, pitch] = VIEWS[S.view].map(a => a * Math.PI / 180);
const dir = cad([Math.cos(pitch) * Math.sin(yaw) * 1000, -Math.cos(pitch) * Math.cos(yaw) * 1000, Math.sin(pitch) * 1000]);
const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(k => cad([S.focus[k & 1 ? 1 : 0][0], S.focus[k & 2 ? 1 : 0][1], S.focus[k & 4 ? 1 : 0][2]]));
const centre = [0, 1, 2].map(i => corners.reduce((s, c) => s + c[i], 0) / 8);
const right = (() => { const r = [dir[2], 0, -dir[0]], l = Math.hypot(...r) || 1; return r.map(v => -v / l); })();
const up = [right[1] * dir[2] - right[2] * dir[1], right[2] * dir[0] - right[0] * dir[2], right[0] * dir[1] - right[1] * dir[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
let w = 0, h = 0, dep = 0; for (const c of corners) { const v = c.map((x, i) => x - centre[i]); w = Math.max(w, Math.abs(dot(v, right))); h = Math.max(h, Math.abs(dot(v, up))); dep = Math.max(dep, Math.abs(dot(v, dir))); }
const focal = 0.085, tanH = 0.018 / focal, tanV = tanH * 9 / 16;
// the region's box is generous (its corners project wider than the parts): frame it at 80 %
const dist = Math.max(w / tanH, h / tanV) * (S.zoom || 0.8) + dep;
const eye = centre.map((c, i) => c + dir[i] * dist);
// an optional orbit about the vertical through the region's centre: the camera's position is a field of time
const ang = fx.time().div(P.stitch).mul(P.orbit).mul(Math.PI / 180), dx = eye[0] - centre[0], dz = eye[2] - centre[2];
const at = [ang.cos().mul(dx).add(ang.sin().mul(dz)).add(centre[0]), eye[1], ang.cos().mul(dz).sub(ang.sin().mul(dx)).add(centre[2])];

const hidden = new Set(S.hide || []);
export default scene()
  .add(...S.parts.filter(p => D.parts[p] && !hidden.has(p)).map(partNode))
  .add(...(cloth ? [cloth] : []))
  .add(shape.plane(20).at(0, -0.26, 0).material(material.pbr().baseColor(0.3).roughness(0.9)))
  // a studio: a big key front-left, a strip behind for rims, a soft top, dark walls
  .light(light.env.hdri(hdri.studio({ wall: 2.5, floor: 5, boxes: [{ az: -40, el: 35, w: 55, h: 38, L: 2400 }, { az: 150, el: 25, w: 14, h: 50, L: 1600 }, { az: 70, el: 15, w: 30, h: 30, L: 500 }, { az: 0, el: 82, w: 80, h: 30, L: 600 }] }), { luminance: u.nit(150) }))
  .camera(camera.thinLens().at(...at).lookAt(...centre).focal(u.mm(85)).fstop(16).exposure(P.ev)
    .motionBlur({ angle: u.deg(180), fps: 24, steps: 4 }));
