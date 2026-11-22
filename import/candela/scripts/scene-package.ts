// scripts/scene-package.ts — write a Candela scene as a *scene package* for the native OptiX host (native/optix/).
//
//   npx tsx scripts/scene-package.ts <presetId> [--time 0] [--size 1920x1080] [--engine "<expr>"] [--out dir]
//
// Version 0 (the OptiX traversal spike, CANDELA-002 step 3): geometry and camera only. Meshes, plus planes, rects
// and boxes as exact triangles; other analytic shapes are listed under `skipped`.
//   <out>/scene.json   { format: 'candela-scene-package', version: 0, preset, time, camera: {width, height, U1..U4},
//                        meshes: [{ name, triangles, offset }],          offset in triangles into geometry.bin
//                        instances: [{ mesh, transform: 12 floats (object → world, 3×4 row-major), object, ty, mat }],
//                        skipped: { <shape type>: count } }            non-mesh objects v0 does not export
//   <out>/geometry.bin float32, 9 per triangle (p0 p1 p2, object space), all meshes back to back
// Positions come from each MeshDef's `tris` (24 floats per triangle: p0 p1 p2 n0 n1 n2 uv0 uv1 uv2); transforms are
// the inverses of the world→object matrices `pack` writes into the object records (the GPU's own data), with
// `animation(t)` poses applied, so the package shows the scene exactly as the WebGPU kernel sees it at that time.
// The camera rows are `cameraUniforms` (U rows 1–4: origin+lens radius, right·tanH+focus, up·tanV+blades, forward+time).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../src/engine/candela';
import { cameraUniforms, inv34 } from '../src/engine/compile';
import { loadCatalogFromDisk } from '../src/content/node';
import { parseArgs } from './render-preset';

const TYPE_NAMES = ['sphere', 'plane', 'rect', 'disk', 'box', 'cylinder', 'capsule', 'torus', 'roundbox', 'cone', 'prism', 'sdf', 'heightfield', 'mesh'];

/** override a scene's engine: `--engine "E.offline().integrator(I.ao({ radius: 0.05 }))"` (E = engine,
 *  I = integrator), the way the workbench's engine menu replaces it; the scene must not export its own engine */
export function withEngine(src: string, expr: string) {
  return `import { engine as E, integrator as I } from 'candela';\n${src}\nexport const engine = ${expr};\n`;
}

/** flat-faced analytic shapes as exact triangles (object space): plane (ty 1; unbounded → 2 km), rect (2), box (4) */
export function primitiveTris(ty: number, pr: number[]): Float32Array | null {
  const quad = (hx: number, hz: number) => [-hx, 0, -hz, -hx, 0, hz, hx, 0, hz, -hx, 0, -hz, hx, 0, hz, hx, 0, -hz];
  if (ty === 1) { const h = pr[0] > 0 ? pr[0] / 2 : 1000; return new Float32Array(quad(h, h)); }
  if (ty === 2) return new Float32Array(quad(pr[0], pr[1]));
  if (ty === 4) {
    const [a, b, c] = pr, v = (i: number) => [i & 1 ? a : -a, i & 2 ? b : -b, i & 4 ? c : -c];
    const faces = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
    const out: number[] = [];
    for (const [i, j, k, l] of faces) out.push(...v(i), ...v(j), ...v(k), ...v(i), ...v(k), ...v(l));
    return new Float32Array(out);
  }
  return null;
}

export interface PackageOptions { time?: number; width?: number; height?: number }

export function scenePackage(compiled: any, o: PackageOptions = {}) {
  const time = o.time || 0, width = o.width || 1920, height = o.height || 1080;
  const poses = compiled.animation ? compiled.animation(time) : null;
  const P = compiled.pack({ time, poses });
  const cam = cameraUniforms(compiled.cameraComp, { width, height, time });
  const objs = compiled.objects as any[];
  const meshIx = new Map<any, number>();
  const meshes: { name: string; triangles: number; offset: number }[] = [];
  const parts: Float32Array[] = [];
  let triAt = 0;
  const instances: any[] = [];
  const skipped: Record<string, number> = {};
  const n = P.O.length / 24;
  for (let k = 0; k < n; k++) {
    const b = k * 24, ty = P.O[b], oi = P.O[b + 21], o = objs[oi];
    if (!o || o.hidden) continue;
    const prim = ty === 13 ? null : primitiveTris(ty, Array.from(P.O.subarray(b + 16, b + 20)));
    if (ty !== 13 && !prim) { const t = TYPE_NAMES[ty] || String(ty); skipped[t] = (skipped[t] || 0) + 1; continue; }
    const def = ty === 13 ? o.def : `${TYPE_NAMES[ty]}:${Array.from(P.O.subarray(b + 16, b + 19)).join(',')}`;
    if (!meshIx.has(def)) {
      let pos: Float32Array;
      if (prim) pos = prim;
      else {
        const T = def.tris as Float32Array, cnt = def.count as number; pos = new Float32Array(cnt * 9);
        for (let t = 0; t < cnt; t++) pos.set(T.subarray(t * 24, t * 24 + 9), t * 9);
      }
      meshIx.set(def, meshes.length);
      meshes.push({ name: prim ? def : def.name || `mesh${meshes.length}`, triangles: pos.length / 9, offset: triAt });
      parts.push(pos); triAt += pos.length / 9;
    }
    const Mi = Array.from(P.O.subarray(b + 4, b + 16));
    instances.push({ mesh: meshIx.get(def), transform: inv34(Mi).map((v: number) => +v.toPrecision(9)), object: oi, ty, mat: P.O[b + 1] });
  }
  const geometry = new Float32Array(triAt * 9);
  let at = 0; for (const p of parts) { geometry.set(p, at); at += p.length; }
  const header = {
    format: 'candela-scene-package', version: 0, time,
    camera: { width, height, U1: cam.U1, U2: cam.U2, U3: cam.U3, U4: cam.U4 },
    meshes, instances, skipped, triangles: triAt,
  };
  return { header, geometry };
}

async function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const id = rest[0];
  if (!id) { console.log('usage: npx tsx scripts/scene-package.ts <presetId> [--time t] [--size WxH] [--engine expr] [--out dir]'); process.exit(1); }
  const preset = loadCatalogFromDisk().presets.find(p => p.id === id);
  if (!preset) throw new Error(`no preset ${id}`);
  const files = Object.assign({}, preset.files);
  if (typeof flags.engine === 'string') files['scene.js'] = withEngine(files['scene.js'], flags.engine);
  const r: any = await build(files);
  if (!r.ok) throw new Error(`${id} does not build: ${(r.diags || []).filter((d: any) => d.severity === 'error').map((d: any) => d.message).join('; ')}`);
  r.compiled.animation = r.animation || null;
  const [width, height] = String(flags.size || '1920x1080').split('x').map(Number);
  const { header, geometry } = scenePackage(r.compiled, { time: +(flags.time || 0), width, height });
  const out = path.resolve(String(flags.out || path.join(os.homedir(), 'data/pbr-spark/packages', id)));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify({ preset: id, ...header }, null, 1));
  fs.writeFileSync(path.join(out, 'geometry.bin'), Buffer.from(geometry.buffer, geometry.byteOffset, geometry.byteLength));
  console.log(`${id} t=${header.time}: ${header.meshes.length} meshes, ${header.instances.length} instances, ${header.triangles} triangles, skipped ${JSON.stringify(header.skipped)} → ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(String(e.stack || e)); process.exit(1); });
