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
// Moving meshes are rendered at the frame time (their motion base is cleared in the copy of O); OptiX motion
// transforms restore their blur in phase 6.
import { blasOf } from '../mesh';

export interface OptixMesh { vertices: Float32Array; count: number; triBase: number }
export interface OptixScene {
  /** pack's object records with the motion base of mesh objects cleared */
  O: Float32Array;
  meshes: OptixMesh[];
  /** per mesh object, 16 floats: [mesh index, object index in O, visibility mask, 0, object→world 3×4 row-major] */
  instances: Float32Array;
  /** per bounded analytic object, 6 floats: world AABB min, max */
  aabbs: Float32Array;
  /** the object index in O of each AABB */
  aabbObjects: Int32Array;
  nBounded: number;
  nObjects: number;
  /** mesh objects whose motion blur is not rendered (phase 3) */
  stilledMeshes: number;
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

export function optixScene(compiled: any, P: any): OptixScene {
  const objs = compiled.objects as any[];
  const O = P.O.slice();
  const meshIndex = new Map<object, number>();
  const meshes: OptixMesh[] = [];
  const inst: number[] = [], aabbs: number[] = [], aabbObjects: number[] = [];
  let stilled = 0;
  for (let k = 0; k < P.nObjs; k++) {
    const oi = P.order[k], o = objs[oi];
    if (o.ty === 13) {
      let mi = meshIndex.get(o.def);
      if (mi === undefined) {
        const vertices = verticesOf(o.def);
        mi = meshes.length; meshIndex.set(o.def, mi);
        meshes.push({ vertices, count: vertices.length / 9, triBase: O[k * 24 + 17] });
      }
      if (O[k * 24 + 22] > 0) { O[k * 24 + 22] = 0; stilled++; }
      const mask = (o.flags & 1) ? MASK_CAMERA : MASK_CAMERA | MASK_SHADOW;
      inst.push(mi, k, mask, 0, ...P.mats[oi]);
    } else if (k < P.nBounded) {
      const b = P.boxes.subarray(k * 6, k * 6 + 6);
      // pad by a relative epsilon: the box is computed in double precision, the intersection in float
      const pad = 1e-4 * Math.max(1, Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3]), Math.abs(b[4]), Math.abs(b[5]));
      aabbs.push(b[0] - pad, b[1] - pad, b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad);
      aabbObjects.push(k);
    }
  }
  return {
    O, meshes, instances: new Float32Array(inst), aabbs: new Float32Array(aabbs), aabbObjects: new Int32Array(aabbObjects),
    nBounded: P.nBounded, nObjects: P.nObjs, stilledMeshes: stilled,
  };
}
