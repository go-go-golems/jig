// targets/optix.ts — what the OptiX target needs besides the WebGPU buffers (CANDELA-002 design doc 02, §5.5, §6.4).
// OptiX replaces one function of the kernel, traceAll, the walk over Candela's top-level BVH. Everything else (hitObj,
// finishHit, materials, lights) runs unchanged, so the OptiX scene is built from the same packed data:
//
//   - meshes (object type 13): one GAS per mesh definition, its triangles in the order of the scene data's triangle
//     records, so that OptiX's primitive index k addresses record `triBase + 7·k` and finishHit can read normals,
//     uvs and faces as it does after hitMesh;
//   - mesh objects: one IAS instance each, transform = the object's matrix at the frame time, instance id = its
//     index in O (= what traceAll returns), visibility mask 1 (camera rays) | 2 (shadow rays) except for glowing
//     objects, which shadow rays skip;
//   - bounded analytic objects (spheres, boxes, discs, SDF shapes …): one custom primitive each in a single GAS, its
//     AABB the world box pack computed (swept over the shutter when it moves); the intersection program calls the
//     translated hitObj, which applies the object's transform and motion poses itself;
//   - unbounded objects (infinite planes) stay in the shim's loop, as in traceAll.
//
// Moving meshes: their instance points at an SRT motion transform whose keys are the kernel's motion poses P_k
// (quaternion, translation, uniform scale, K keys evenly over the shutter τ ∈ [0, 1]), above a static transform M_c
// (the matrix at the frame time): world = P(τ)·M_c·object, as xfP computes it. OptiX interpolates SRT keys the way
// poseQ/poseT do (component-wise, quaternion normalised); keys are sign-aligned so each step takes the short way.
// Meshes are built once (optixMeshes); instances, motion and AABBs change from frame to frame (optixFrame).
import { blasOf } from '../mesh';

export interface OptixMesh { vertices: Float32Array; count: number; triBase: number }
/** the frame-dependent part: instances, motion transforms, analytic AABBs */
export interface OptixFrame {
  /** pack's object records (motion base cleared for moving meshes only when motion transforms are off) */
  O: Float32Array;
  /** per mesh object, 16 floats: [mesh index, object index in O, visibility mask, motion slot + 1 (0: static),
   *  object→world 3×4 row-major at the frame time] */
  instances: Float32Array;
  /** per moving mesh object (motion slot), 12 + 16·motionKeys floats: world→object 3×4 at the frame time, then one
   *  OptixSRTData (sx a b pvx sy c pvy sz pvz qx qy qz qw tx ty tz) per key */
  srt: Float32Array;
  motionKeys: number;
  /** per bounded analytic object, 6 floats: world AABB min, max */
  aabbs: Float32Array;
  /** the object index in O of each AABB */
  aabbObjects: Int32Array;
  /** built-in sphere primitives (phase 6): per sphere 4 floats, world centre and radius — shadow-casting spheres
   *  first, then `glowSpheres` glowing ones (flags & 1: shadow rays skip them, so they get their own GAS) */
  spheres: Float32Array;
  /** the object index in O of each sphere (primitive index → object, across both GASes) */
  sphereObjects: Int32Array;
  glowSpheres: number;
  nBounded: number;
  nObjects: number;
  movingMeshes: number;
  /** moving meshes rendered without blur (motion transforms off) */
  stilledMeshes: number;
}
export interface OptixScene extends OptixFrame {
  meshes: OptixMesh[];
  /** the pipeline needs motion support (motion blur on and meshes that can move) */
  motion: boolean;
  /** the pipeline includes OptiX's built-in sphere intersector (the first frame has spheres that qualify) */
  builtinSpheres: boolean;
}

/** a packed sphere (type 0) that OptiX's built-in intersector can take: bounded, not moving within the shutter, and a
 *  similarity transform (rotation, uniform scale, translation), so it is a sphere in world space too. Returns
 *  [cx, cy, cz, r] or null. O rows 1–3 hold world→object A·x + b, so A = R/s: A·Aᵀ = I/s², centre = −A⁻¹b = −s²·Aᵀb. */
function worldSphere(O: Float32Array, k: number, materials: any[]): number[] | null {
  const b = k * 24;
  if (O[b] !== 0 || O[b + 22] > 0) return null;
  // rays inside the sphere (glass, thin shells, media, subsurface walks) must hit it from within: custom primitive
  const m = materials && materials[O[b + 1]];
  if (!m || m.enterable !== false) return null;
  const A = [O[b + 4], O[b + 5], O[b + 6], O[b + 8], O[b + 9], O[b + 10], O[b + 12], O[b + 13], O[b + 14]];
  const t = [O[b + 7], O[b + 11], O[b + 15]];
  const row = (i: number, j: number) => A[i * 3] * A[j * 3] + A[i * 3 + 1] * A[j * 3 + 1] + A[i * 3 + 2] * A[j * 3 + 2];
  const c = row(0, 0);
  if (!(c > 0)) return null;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (Math.abs(row(i, j) - (i === j ? c : 0)) > 1e-5 * c) return null;
  const s2 = 1 / c;
  const cx = -s2 * (A[0] * t[0] + A[3] * t[1] + A[6] * t[2]);
  const cy = -s2 * (A[1] * t[0] + A[4] * t[1] + A[7] * t[2]);
  const cz = -s2 * (A[2] * t[0] + A[5] * t[1] + A[8] * t[2]);
  return [cx, cy, cz, O[b + 16] * Math.sqrt(s2)];
}

const MASK_CAMERA = 1, MASK_SHADOW = 2;
const meshVerts = new WeakMap<object, Float32Array>();

/** a mesh definition's triangles as OptiX vertex triples, in the order of its scene-data records */
function verticesOf(def: any): Float32Array {
  let v = meshVerts.get(def);
  if (v) return v;
  const b = blasOf(def), T: Float32Array = b.tris, n = T.length / 28;
  v = new Float32Array(n * 9);
  for (let k = 0; k < n; k++) {
    const r = k * 28, o = k * 9;
    const x = T[r], y = T[r + 1], z = T[r + 2];
    v[o] = x; v[o + 1] = y; v[o + 2] = z;                                    // v0
    v[o + 3] = x + T[r + 4]; v[o + 4] = y + T[r + 5]; v[o + 5] = z + T[r + 6];   // v0 + e1
    v[o + 6] = x + T[r + 8]; v[o + 7] = y + T[r + 9]; v[o + 8] = z + T[r + 10];  // v0 + e2
  }
  meshVerts.set(def, v);
  return v;
}

/** mesh definitions in a stable order (by first use in compiled.objects), so indices hold from frame to frame */
const meshTables = new WeakMap<object, { index: Map<object, number>; defs: any[] }>();
function meshTable(compiled: any) {
  let t = meshTables.get(compiled);
  if (!t) {
    t = { index: new Map(), defs: [] };
    for (const o of compiled.objects as any[]) if (o.ty === 13 && !t.index.has(o.def)) { t.index.set(o.def, t.defs.length); t.defs.push(o.def); }
    meshTables.set(compiled, t);
  }
  return t;
}

/** the GAS inputs, built once per scene: every mesh definition, with the base row of its triangle records */
export function optixMeshes(compiled: any, P: any): OptixMesh[] {
  const t = meshTable(compiled), objs = compiled.objects as any[];
  const base = new Map<object, number>();
  for (let k = 0; k < P.nObjs; k++) { const o = objs[P.order[k]]; if (o.ty === 13 && !base.has(o.def)) base.set(o.def, P.O[k * 24 + 17]); }
  return t.defs.map(def => { const vertices = verticesOf(def); return { vertices, count: vertices.length / 9, triBase: base.get(def) ?? 0 }; });
}

/** motion keys of the kernel's poses at scene-data row mb, as OptixSRTData records, quaternions sign-aligned */
function srtKeys(SD: Float32Array, mb: number, K: number, out: number[]) {
  let px = 0, py = 0, pz = 0, pw = 1;
  for (let j = 0; j < K; j++) {
    const q = (mb + 2 * j) * 4, t = q + 4;
    let qx = SD[q], qy = SD[q + 1], qz = SD[q + 2], qw = SD[q + 3];
    if (j > 0 && px * qx + py * qy + pz * qz + pw * qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
    px = qx; py = qy; pz = qz; pw = qw;
    const sc = SD[t + 3];
    out.push(sc, 0, 0, 0, sc, 0, 0, sc, 0, qx, qy, qz, qw, SD[t], SD[t + 1], SD[t + 2]);
  }
}

/** the frame-dependent OptiX inputs from one pack (SD: static head + dynamic tail, as uploaded) */
export function optixFrame(compiled: any, P: any, SD: Float32Array, o: { motion: boolean; spheres?: boolean }): OptixFrame {
  const objs = compiled.objects as any[], t = meshTable(compiled);
  const O = P.O.slice();
  const K = Math.max(0, Math.round(P.U[24 * 4 + 1] || 0));
  const inst: number[] = [], srt: number[] = [], aabbs: number[] = [], aabbObjects: number[] = [];
  const sph: number[] = [], sphObj: number[] = [], glow: number[] = [], glowObj: number[] = [];
  let stilled = 0, moving = 0;
  for (let k = 0; k < P.nObjs; k++) {
    const oi = P.order[k], ob = objs[oi];
    if (ob.ty === 13) {
      const mi = t.index.get(ob.def)!;
      let slot = 0;
      const mb = O[k * 24 + 22] - 1;
      if (mb >= 0) {
        moving++;
        if (o.motion && K >= 2) { slot = moving; for (let j = 0; j < 12; j++) srt.push(O[k * 24 + 4 + j]); srtKeys(SD, mb, K, srt); }
        else { O[k * 24 + 22] = 0; stilled++; }
      }
      const mask = (ob.flags & 1) ? MASK_CAMERA : MASK_CAMERA | MASK_SHADOW;
      inst.push(mi, k, mask, slot, ...P.mats[oi]);
    } else if (k < P.nBounded) {
      const ws = o.spheres ? worldSphere(O, k, compiled.materials) : null;
      if (ws) {
        if (O[k * 24 + 3] & 1) { glow.push(...ws); glowObj.push(k); } else { sph.push(...ws); sphObj.push(k); }
        continue;
      }
      const b = P.boxes.subarray(k * 6, k * 6 + 6);
      // pad by a relative epsilon: the box is computed in double precision, the intersection in float
      const pad = 1e-4 * Math.max(1, Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3]), Math.abs(b[4]), Math.abs(b[5]));
      aabbs.push(b[0] - pad, b[1] - pad, b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad);
      aabbObjects.push(k);
    }
  }
  // slots were numbered by moving meshes; renumber densely over those with transforms
  let n = 0; for (let r = 0; r < inst.length; r += 16) if (inst[r + 3] > 0) inst[r + 3] = ++n;
  return {
    O, instances: new Float32Array(inst), srt: new Float32Array(srt), motionKeys: K, aabbs: new Float32Array(aabbs), aabbObjects: new Int32Array(aabbObjects),
    spheres: new Float32Array(sph.concat(glow)), sphereObjects: new Int32Array(sphObj.concat(glowObj)), glowSpheres: glowObj.length,
    nBounded: P.nBounded, nObjects: P.nObjs, movingMeshes: moving, stilledMeshes: stilled,
  };
}

/** everything the OptiX target needs for the first frame; `motion`: build the pipeline with motion transforms */
export function optixScene(compiled: any, P: any, SD: Float32Array, o: { motion: boolean; spheres?: boolean }): OptixScene {
  const meshes = optixMeshes(compiled, P);
  const fr = optixFrame(compiled, P, SD, { motion: o.motion, spheres: o.spheres !== false });
  return { meshes, motion: o.motion, builtinSpheres: fr.sphereObjects.length > 0, ...fr };
}
