// display.ts — how accumulated radiance becomes the displayed image, shared by the browser viewport and the headless
// renderers (candela-rt translates the same display program to CUDA; CANDELA-002 phase 4): the post-pass settings a
// scene's engine asks for, the display program (denoise, exposure, bloom, tone map, user passes), its uniforms, the
// exposure meter, and the passes a compositor gets.
import { POST } from './kernel';
import { genFunction, lift, E, node, parseColor, constNode } from './fx';
import { CandelaError } from './diag';

export const TONEMAP_IX = { agx: 0, aces: 1, neutral: 2, reinhard: 3, filmic: 4, linear: 5 };

// the display function: HDR in, display-referred out
export function displaySource(userPasses: any[] = []) {
  const args = p => [0, 1, 2, 3].map(i => `D(${8 + p.slot * 4 + i})`).join(', ');
  const hdr = userPasses.filter(p => p.stage !== 'display').map(p => `  c = ${p.fn}(c, uv, alb, nrm, ${args(p)});`).join('\n');
  const dsp = userPasses.filter(p => p.stage === 'display').map(p => `  t = ${p.fn}(t, uv, alb, nrm, ${args(p)});`).join('\n');
  return POST + userPasses.map(p => p.code).join('\n') + `
fn denoisePx(p: vec2i, stp: i32, res: vec2i, sc: f32, ex: f32) -> vec3f {
  let c0: vec3f = cAt(p);
  let n0: vec4f = nAt(p);
  let a0: vec3f = aAt(p);
  let e0: vec3f = c0 * ex;
  var sum: vec3f = vec3f(0.0, 0.0, 0.0);
  var ws: f32 = 0.0;
  for (var j: i32 = -2; j <= 2; j++) {
    for (var i: i32 = -2; i <= 2; i++) {
      let q: vec2i = clamp(p + vec2i(i, j) * stp, vec2i(0, 0), res - vec2i(1, 1));
      let kx: f32 = select(select(0.375, 0.25, abs(i) == 1), 0.0625, abs(i) == 2);
      let ky: f32 = select(select(0.375, 0.25, abs(j) == 1), 0.0625, abs(j) == 2);
      let c1: vec3f = cAt(q);
      let n1: vec4f = nAt(q);
      let w: f32 = kx * ky * atrousW(e0, c1 * ex, n0.xyz, n1.xyz, a0, aAt(q), sc, 32.0, 0.05) * exp(-abs(n0.w - n1.w) / max(0.03 * n0.w, 0.001));
      sum = sum + c1 * w;
      ws = ws + w;
    }
  }
  return sum / max(ws, 1e-8);
}
fn grainHash(p: vec2f, s: f32) -> f32 { return fract(sin(dot(p + s, vec2f(12.9898, 78.233))) * 43758.5453); }
fn displayPx(p: vec2i, res: vec2i) -> vec4f {
  let d0: vec4f = D(0);
  let d1: vec4f = D(1);
  let d2: vec4f = D(2);
  let d3: vec4f = D(3);
  let uv: vec2f = (vec2f(f32(p.x), f32(p.y)) + 0.5) / vec2f(f32(res.x), f32(res.y));
  let alb: vec3f = aAt(p);
  let nrm: vec3f = nAt(p).xyz;
  let view: i32 = i32(d1.z);
  if (view == 1) { return vec4f(srgbEnc(clamp(alb, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0))), 1.0); }
  if (view == 2) { return vec4f(srgbEnc(nrm * 0.5 + 0.5), 1.0); }
  if (view == 3) { let z: f32 = 1.0 - exp(-nAt(p).w * 0.15); return vec4f(z, z, z, 1.0); }
  var c: vec3f = cAt(p) * d0.w;
  if (d2.z > 0.0) {
    var g: vec3f = vec3f(0.0, 0.0, 0.0);
    for (var k: i32 = 0; k < 12; k++) {
      let a: f32 = f32(k) * 2.39996;
      let r: f32 = 3.0 + f32(k) * 2.2;
      let q: vec2i = clamp(p + vec2i(i32(cos(a) * r), i32(sin(a) * r)), vec2i(0, 0), res - vec2i(1, 1));
      g = g + max(cAt(q) * d0.w - 1.0, vec3f(0.0, 0.0, 0.0));
    }
    c = c + g * (d2.z / 12.0);
  }
${hdr}
  if (d1.y > 0.5) { return vec4f(falseColor(lum(c)), 1.0); }
  if (d2.x > 0.0) {
    let ndc: vec2f = uv * 2.0 - 1.0;
    let tc: f32 = 1.0 / sqrt(1.0 + sq(ndc.x * d3.x) + sq(ndc.y * d3.y));
    c = c * mix(1.0, tc * tc * tc * tc, d2.x);
  }
  var t: vec3f = tonemap(c, i32(d1.x));
  if (d2.y > 0.0) { let n: f32 = grainHash(vec2f(f32(p.x), f32(p.y)), d2.w) - 0.5; t = t * (1.0 + n * d2.y * 2.0); }
${dsp}
  return vec4f(srgbEnc(clamp(t, vec3f(0.0, 0.0, 0.0), vec3f(1.0, 1.0, 1.0))), 1.0);
}
`;
}


// a user pass: pass.define(name, { params, kernel: ({ color, uv, albedo, normal }, params) => colour }) → WGSL
export function compileUserPass(p, k) {
  // each pass gets four rows of the display uniforms, one per param: a scalar in .x or a colour in .xyz
  const names = Object.keys(p.params || {}).slice(0, 4);
  const isCol = n => { const d = p.params[n]; return !!(d && d.__def && d.__def.kind === 'color'); };
  const pv: Record<string, any> = {};
  names.forEach((n, i) => { pv[n] = E(node('ctx', isCol(n) ? 'v3' : 'f', [], '__p' + i)); });
  const ctx = { color: E(node('ctx', 'v3', [], 'color')), uv: E(node('ctx', 'v2', [], 'uv')), albedo: E(node('ctx', 'v3', [], 'alb')), normal: E(node('ctx', 'v3', [], 'nrm')), luminance: E(node('dot', 'f', [node('ctx', 'v3', [], 'color'), constNode([0.2126, 0.7152, 0.0722])])) };
  const root = lift(p.kernel(ctx, pv));
  const fn = `upass_${k}`;
  const cmap = { color: 'c', uv: 'uv', alb: 'alb', nrm: 'nrm' }; names.forEach((n, i) => { cmap['__p' + i] = isCol(n) ? `p${i}.xyz` : `p${i}.x`; });
  const code = genFunction(fn, [['c', 'vec3f'], ['uv', 'vec2f'], ['alb', 'vec3f'], ['nrm', 'vec3f'], ['p0', 'vec4f'], ['p1', 'vec4f'], ['p2', 'vec4f'], ['p3', 'vec4f']], 'v3', root, { ctx: cmap, uniform: () => { throw new CandelaError('E207', 'a pass kernel reads its own params, not the scene\'s'); }, label: 'a pass' });
  const valueOf = n => { const d = p.params[n]; let v = p.opts && p.opts[n] != null ? p.opts[n] : d && d.__def ? d.__def.def : d; if (isCol(n)) { const c = typeof v === 'string' ? parseColor(v) : Array.isArray(v) ? v : [v, v, v]; return [c[0], c[1], c[2], 0]; } return [+v || 0, 0, 0, 0]; };
  const rows = names.map(valueOf);
  return { fn, code, slot: k, stage: p.stage || 'hdr', name: p.name, values: () => { const out = new Float32Array(16); rows.forEach((r, i) => out.set(r, i * 4)); return out; } };
}


export interface PostSettings { tonemap: string; denoise: boolean; bloom: number; falseColor: boolean; vignette: number; grain: number }

/** the post passes a scene's engine declares: built-in settings, and user passes compiled to WGSL */
export function postSettings(engine: any): { post: PostSettings; userPasses: any[] } {
  const post: PostSettings = { tonemap: 'agx', denoise: !!(engine && engine.denoise), bloom: 0, falseColor: false, vignette: 0, grain: 0 };
  const user: any[] = [];
  for (const p of (engine && engine.post) || []) {
    if (p.__pass === 'tonemap') post.tonemap = p.op;
    else if (p.__pass === 'denoise') post.denoise = true;
    else if (p.__pass === 'bloom') post.bloom = p.strength;
    else if (p.__pass === 'falseColor') post.falseColor = true;
    else if (p.__pass === 'vignette') post.vignette = p.strength;
    else if (p.__pass === 'grain') post.grain = p.amount;
    else if (p.__pass === 'custom') user.push(p);
  }
  return { post, userPasses: user.map((p, k) => compileUserPass(p, k)) };
}

export interface DisplayOptions {
  width: number; height: number; spp: number;
  /** exposure value (EV100) the image is shown at */
  ev: number;
  post: PostSettings; userPasses: any[];
  /** 0 beauty, 1 albedo, 2 normal, 3 depth */
  view?: number;
  /** changes the film grain's pattern */
  frameN?: number;
  /** the camera's vertical field of view (radians), for the vignette */
  fov?: number;
  tonemap?: string | null; falseColor?: boolean | null; denoise?: boolean | null;
}
export interface DisplayUniforms { D: Float32Array; denoise: { steps: number; sigma: number } | null }

/** the display program's uniforms (32 vec4 rows) and the denoiser's schedule for this many samples */
export function displayUniforms(o: DisplayOptions): DisplayUniforms {
  const w = o.width, h = o.height, view = o.view || 0, post = o.post;
  const D = new Float32Array(32 * 4);
  D.set([w, h, Math.max(1, o.spp), 1 / (1.2 * Math.pow(2, o.ev))], 0);
  D.set([TONEMAP_IX[o.tonemap || post.tonemap] ?? 0, (o.falseColor ?? post.falseColor) ? 1 : 0, view, 0], 4);
  D.set([post.vignette || 0, post.grain || 0, post.bloom || 0, ((o.frameN || 0) * 7.13) % 1], 8);
  const tanH = Math.tan((o.fov || 0.7) / 2); D.set([tanH, tanH * h / w, 0, 0], 12);
  for (const p of o.userPasses) D.set(p.values(), (8 + p.slot * 4) * 4);
  const spp = o.spp;
  const denoise = (o.denoise ?? post.denoise) && view === 0 && spp < 512 ? { steps: spp < 64 ? 4 : spp < 192 ? 3 : 2, sigma: spp < 16 ? 1.2 : 0.6 } : null;
  return { D, denoise };
}

/** the uniforms of denoise step k (of an à-trous wavelet filter: step 2^k, edge-stopping sigma halving each step) */
export function denoiseStepUniforms(D: Float32Array, k: number, sigma: number): Float32Array {
  const d = new Float32Array(D); d[1 * 4 + 3] = k === 0 ? 0 : 1; d[16] = 1 << k; d[17] = sigma / (1 << k);
  return d;
}

/** a reflected-light exposure meter over the accumulation buffer (float4 per pixel: radiance sum, sample count):
 *  block means first (a log of noisy samples is biased low), then a centre-weighted log-average */
export function meterExposure(f: ArrayLike<number>, w: number, h: number): { Lavg: number; ev: number } | null {
  const BX = 48, BY = 32, bw = w / BX, bh = h / BY; let s = 0, n = 0; const means: { L: number; wgt: number }[] = [];
  for (let by = 0; by < BY; by++) for (let bx = 0; bx < BX; bx++) {
    let sum = 0, cnt = 0;
    const x0 = Math.floor(bx * bw), x1 = Math.max(x0 + 1, Math.floor((bx + 1) * bw)), y0 = Math.floor(by * bh), y1 = Math.max(y0 + 1, Math.floor((by + 1) * bh));
    const sx = Math.max(1, (x1 - x0) >> 2), sy = Math.max(1, (y1 - y0) >> 2);
    for (let y = y0; y < y1 && y < h; y += sy) for (let x = x0; x < x1 && x < w; x += sx) { const i = (y * w + x) * 4, c = f[i + 3] || 1; const L = (0.2126 * f[i] + 0.7152 * f[i + 1] + 0.0722 * f[i + 2]) / c; if (Number.isFinite(L)) { sum += L; cnt++; } }
    if (!cnt) continue;
    const cx = (bx + 0.5) / BX - 0.5, cy = (by + 0.5) / BY - 0.5, wgt = 1 + Math.exp(-(cx * cx + cy * cy) * 8);
    means.push({ L: sum / cnt, wgt });
  }
  // blocks of empty void (no environment behind the scene) say nothing about exposure: leave out anything
  // more than ~13 stops below the bright end of the frame
  const sorted = means.map(m => m.L).sort((a, b) => a - b);
  const L90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;
  const floor = Math.max(L90 * 1e-4, 1e-7);
  for (const m of means) { if (m.L < floor && L90 > 0) continue; s += Math.log(Math.max(m.L, 1e-4)) * m.wgt; n += m.wgt; }
  const Lavg = Math.exp(s / Math.max(n, 1));
  // reflected-light meter: EV100 = log2(L·S/K), K = 12.5
  let ev = Math.log2(Math.max(Lavg, 1e-4) * 100 / 12.5);
  // highlight protection: a mostly dark frame (a stage, a night street) would push the lit part far past white;
  // keep the 98th-percentile block within ~1.5 stops of saturation, but never darken by more than 4 stops
  if (sorted.length > 16) { const L98 = sorted[Math.floor(sorted.length * 0.98)]; const evH = Math.log2(Math.max(L98, 1e-6) / (1.2 * 3)); if (evH > ev) ev = Math.min(evH, ev + 4); }
  return Number.isFinite(ev) ? { Lavg, ev } : null;
}

/** the accumulated beauty (scene-linear, nits), albedo, normal and depth, averaged over the samples so far, from the
 *  accum/aovA/aovN buffers (float4 per pixel, rows top-down) */
export function passesFromBuffers(c: ArrayLike<number>, a: ArrayLike<number>, nn: ArrayLike<number>, w: number, h: number) {
  const n = w * h;
  if (c.length < n * 4 || a.length < n * 4 || nn.length < n * 4) throw new CandelaError('E121', `passes: buffers smaller than ${w}×${h}`);
  const beauty = new Float32Array(n * 3), albedo = new Float32Array(n * 3), normal = new Float32Array(n * 3), depth = new Float32Array(n);
  for (let si = 0; si < n; si++) {
    const k = 1 / (c[si * 4 + 3] || 1);
    for (let j = 0; j < 3; j++) { beauty[si * 3 + j] = c[si * 4 + j] * k; albedo[si * 3 + j] = a[si * 4 + j] * k; }
    const nx = nn[si * 4], ny = nn[si * 4 + 1], nz = nn[si * 4 + 2]; const l = Math.hypot(nx, ny, nz) || 1;
    normal[si * 3] = nx / l; normal[si * 3 + 1] = ny / l; normal[si * 3 + 2] = nz / l; depth[si] = nn[si * 4 + 3] * k;
  }
  return { beauty, albedo, normal, depth };
}
