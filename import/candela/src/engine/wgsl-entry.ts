// wgsl-entry.ts — the WGSL that wraps a scene's program on the WebGPU target: storage bindings with their accessors
// (prelude) and the compute entry point that accumulates renderPixel's output (main). Used by GPURenderer
// (render.ts) in the browser and by the Node/Dawn reference renderer (scripts/wgsl-render.ts); the CUDA target's
// equivalents are native/rt/kernels/candela_cuda_params.h, candela_accessors.inc and candela_compute.cuh.
export const WGSL_PRELUDE = `@group(0) @binding(0) var<storage, read> uni: array<vec4f>;
@group(0) @binding(1) var<storage, read> objs: array<vec4f>;
@group(0) @binding(2) var<storage, read> lits: array<vec4f>;
@group(0) @binding(3) var<storage, read> bvhs: array<vec4f>;
@group(0) @binding(4) var<storage, read> sd: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> accum: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> aovA: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> aovN: array<vec4f>;
fn U(i: i32) -> vec4f { return uni[i]; }
fn objF(i: i32) -> vec4f { return objs[i]; }
fn litF(i: i32) -> vec4f { return lits[i]; }
fn bvhF(i: i32) -> vec4f { return bvhs[i]; }
fn sdF(i: i32) -> vec4f { return sd[i]; }
`;

export const WGSL_MAIN = `
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let res: vec2f = U(0).xy;
  if (f32(gid.x) >= res.x || f32(gid.y) >= res.y) { return; }
  let o: PixOut = renderPixel(vec2f(f32(gid.x), f32(gid.y)), u32(U(0).z));
  let ix: u32 = gid.y * u32(res.x) + gid.x;
  if (U(0).z < 0.5) { accum[ix] = o.c; if (i32(U(21).w) != 20) { aovA[ix] = o.alb; aovN[ix] = o.nrm; } }
  else { accum[ix] = accum[ix] + o.c; aovA[ix] = aovA[ix] + o.alb; aovN[ix] = aovN[ix] + o.nrm; }
}
`;
