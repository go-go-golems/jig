// scripts/render-preset.ts — render a preset headless on the GPU through the workbench's own render queue.
//
//   npx tsx scripts/render-preset.ts <presetId> [--param id=value]… [--size 1920x1080] [--spp 64] [--seed 1]
//       [--still [--time 1.2 (default: the preset's start time)]] | [--sequence --start 0 --end 2 --fps 24]
//       [--format png|exr|both|mp4|webm] [--quality draft|standard|high|max] [--backend webgpu|webgl2]
//       [--name stem] [--out dir] [--allow-software] [--engine "E.offline().integrator(I.ao({ radius: 0.05 }))"]
//
// How it works: serves dist/ (run `npm run build` first) on localhost, opens the workbench in Playwright's headless
// shell with GPU flags (ANGLE on Vulkan, WebGPU), loads the preset by its #id, applies params through the param
// store, then calls host.render(…) — the same path as the Render dialog (runRender: seeding, exposure lock,
// sequences, PNG/EXR/WebCodecs video). Files come back to Node in base64 chunks and are written to --out
// (default ~/data/pbr-spark/renders/<presetId>/). It refuses to run on a software rasteriser unless
// --allow-software is given. See CANDELA-002, design doc §4.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { serve } from './shot';

/** headless-shell flags that reach the NVIDIA GPU on the DGX Spark (CANDELA-002 various/01-gpu-probe.txt) */
export const GPU_ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

export interface RenderJob {
  kind: 'still' | 'sequence';
  width: number;
  height: number;
  spp: number;
  format: 'png' | 'exr' | 'both' | 'mp4' | 'webm';
  seed?: number;
  time?: number;
  start?: number;
  end?: number;
  fps?: number;
  quality?: string;
  name?: string;
}
export interface RenderPresetOptions {
  preset: string;
  params?: Record<string, string | number | boolean>;
  /** replace the scene's engine, e.g. "E.offline().integrator(I.ao({ radius: 0.05 }))" (see scene-package.ts withEngine) */
  engine?: string;
  job: RenderJob;
  backend?: 'webgpu' | 'webgl2';
  outDir: string;
  allowSoftware?: boolean;
  dist?: string;
  port?: number;
  log?: (msg: string) => void;
}
export interface RenderPresetResult {
  files: string[];
  backend: string;
  ms: number;
  stats: Record<string, unknown> | null;
}

const IDLE = () => {
  const w = (window as any).workbench;
  return !!(w && w.result && !w.building && !w.compiling && w.vp && w.vp.compiled && w.vp.backend);
};

async function waitIdle(page: Page, timeout = 600000) {
  await page.waitForFunction(IDLE, null, { timeout, polling: 50 });
}

/** a browser session that can render several jobs (the lockstitch tool renders seven scenes in one session) */
export async function openSession(o: { backend?: 'webgpu' | 'webgl2'; dist?: string; port?: number } = {}) {
  const dist = path.resolve(o.dist || 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error(`${dist}/index.html not found: run \`npm run build\` first`);
  const port = o.port || 8770;
  const srv = serve(dist, port);
  const browser = await chromium.launch({ args: GPU_ARGS });
  const close = async () => { await browser.close(); srv.close(); };
  return { browser, port, backend: o.backend || 'webgpu', close };
}
type Session = Awaited<ReturnType<typeof openSession>>;

export async function renderWith(session: Session, o: RenderPresetOptions): Promise<RenderPresetResult> {
  const log = o.log || ((m: string) => console.log(m));
  const page = await session.browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // files arrive in chunks: (name, index, last, base64)
  fs.mkdirSync(o.outDir, { recursive: true });
  const written: string[] = [];
  const open = new Map<string, number>();
  await page.exposeFunction('candelaChunk', (name: string, first: boolean, last: boolean, b64: string) => {
    const file = path.join(o.outDir, path.basename(name));
    if (first) { open.set(name, fs.openSync(file, 'w')); }
    fs.writeSync(open.get(name)!, Buffer.from(b64, 'base64'));
    if (last) { fs.closeSync(open.get(name)!); open.delete(name); written.push(file); }
  });
  await page.addInitScript(b => { try { localStorage.clear(); localStorage.setItem('candela.v1.backend', JSON.stringify(b)); } catch { /* none */ } }, o.backend || session.backend);
  await page.goto(`http://localhost:${session.port}/index.html#${encodeURIComponent(o.preset)}`);
  await waitIdle(page);
  const loaded = await page.evaluate(() => { const w = (window as any).workbench; return { id: w.preset.id, ok: w.result.ok, backend: `${w.vp.backend.name} ${w.vp.backend.info || ''}`.trim() }; });
  if (loaded.id !== o.preset) throw new Error(`unknown preset '${o.preset}' (the workbench loaded ${loaded.id})`);
  if (!/nvidia/i.test(loaded.backend) && !o.allowSoftware) throw new Error(`not on the NVIDIA GPU: backend is "${loaded.backend}" (pass --allow-software to render anyway)`);
  log(`${o.preset}: ${loaded.backend}`);

  if (o.engine) {
    const seq = await page.evaluate(expr => {
      const w = (window as any).workbench, seq = w._seq || 0;
      w.setFile('scene.js', `import { engine as E, integrator as I } from 'candela';\n${w.files['scene.js']}\nexport const engine = ${expr};\n`);
      w.build({});
      return seq;
    }, o.engine);
    await page.waitForFunction(seq => (window as any).workbench._seq > seq, seq, { timeout: 60000, polling: 20 });
    await waitIdle(page);
    log(`  engine = ${o.engine}`);
  }
  // params: a static param (choice, .static()) rebuilds the scene; wait for the new build
  for (const [id, value] of Object.entries(o.params || {})) {
    const r = await page.evaluate(({ id, value }) => {
      const w = (window as any).workbench;
      const h = w.params().find((p: any) => p.id === id);
      if (!h) return { error: `no param '${id}' (have ${w.params().map((p: any) => p.id).join(', ')})` };
      const seq = w._seq || 0;
      const v = h.kind === 'choice' || typeof value !== 'string' || isNaN(+value) ? value : +value;
      const same = JSON.stringify(h.value) === JSON.stringify(v);   // setting the current value triggers no rebuild
      if (!same) h.set(v);
      return { seq, isStatic: !!h.isStatic && !same, value: (h.display ? h.display() : String(v)) + (same ? ' (unchanged)' : '') };
    }, { id, value });
    if ('error' in r) throw new Error(r.error as string);
    if (r.isStatic) await page.waitForFunction(seq => (window as any).workbench._seq > seq, r.seq, { timeout: 60000, polling: 20 });
    await waitIdle(page);
    log(`  param ${id} = ${r.value}${r.isStatic ? ' (static: rebuilt)' : ''}`);
  }
  const built = await page.evaluate(() => { const w = (window as any).workbench; return { ok: w.result.ok, diags: (w.diags || []).filter((d: any) => d.severity === 'error').map((d: any) => `${d.code} ${d.message}`), stats: w.result.ok ? w.result.compiled.stats : null }; });
  if (!built.ok) throw new Error(`${o.preset} does not build:\n  ${built.diags.join('\n  ')}`);

  // the job, through the render queue; progress printed every ~2 s
  const job = Object.assign({ seed: 1, name: o.job.name || o.preset }, o.job, o.job.kind === 'sequence' && /png|exr|both/.test(o.job.format) ? { packaging: 'files' } : {});
  const t0 = Date.now();
  await page.evaluate(job => {
    const w = (window as any).workbench;
    w.running = false;   // the clock stays where the job puts it (stills: --time; sequences: each frame's time)
    // a still without --time renders at the preset's start time, not wherever the clock got to while the page loaded
    if (job.kind === 'still' && job.time == null) job.time = (w.preset && w.preset.time) || 0;
    (window as any).__job = w.render(Object.assign({ autosave: false }, job));
  }, job);
  let lastNote = '';
  let lastLog = 0;
  for (;;) {
    const s = await page.evaluate(() => { const j = (window as any).__job; return { status: j.status, progress: j.progress, note: j.note, error: j.error ? String(j.error.message || j.error) : null }; });
    if (s.status === 'done') break;
    if (s.status === 'failed' || s.status === 'cancelled') throw new Error(`render ${s.status}: ${s.error || ''}`);
    const note = `  ${(s.progress * 100).toFixed(0).padStart(3)}% ${s.note || s.status}`;
    if (note !== lastNote && Date.now() - lastLog > 2000) { log(note); lastNote = note; lastLog = Date.now(); }
    await new Promise(r => setTimeout(r, 100));
  }
  // the queue's own timing (job start → done), else the poll's
  const ms = (await page.evaluate(() => (window as any).__job.ms)) || Date.now() - t0;
  // send the files back in chunks (3 MiB of bytes → 4 MiB of base64 per call)
  await page.evaluate(async () => {
    const j = (window as any).__job, CH = 3 * 1024 * 1024;
    for (const f of j.files || []) {
      const d: Uint8Array = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      if (!d.length) { await (window as any).candelaChunk(f.name, true, true, ''); continue; }
      for (let i = 0; i < d.length; i += CH) {
        const part = d.subarray(i, Math.min(d.length, i + CH));
        let bin = '';
        for (let k = 0; k < part.length; k += 0x8000) bin += String.fromCharCode(...part.subarray(k, k + 0x8000));
        await (window as any).candelaChunk(f.name, i === 0, i + CH >= d.length, btoa(bin));
      }
    }
  });
  if (errors.length) log('  page errors: ' + errors.slice(0, 3).join(' | '));
  await page.close();
  return { files: written, backend: loaded.backend, ms, stats: built.stats };
}

export async function renderPreset(o: RenderPresetOptions): Promise<RenderPresetResult> {
  const s = await openSession({ backend: o.backend, dist: o.dist, port: o.port });
  try { return await renderWith(s, o); } finally { await s.close(); }
}

// ---------- command line ----------
export function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {}, params: Record<string, string> = {}, rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { rest.push(a); continue; }
    const k = a.slice(2), next = argv[i + 1];
    const v = next != null && !next.startsWith('--') ? (i++, next) : true;
    if (k === 'param') { const s = String(v), eq = s.indexOf('='); if (eq < 1) throw new Error(`--param id=value, got '${s}'`); params[s.slice(0, eq)] = s.slice(eq + 1); }
    else flags[k] = v;
  }
  return { flags, params, rest };
}

async function main() {
  const { flags, params, rest } = parseArgs(process.argv.slice(2));
  const preset = rest[0];
  if (!preset || flags.help) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 7).join('\n')); process.exit(preset ? 0 : 1); }
  const [width, height] = String(flags.size || '1920x1080').split('x').map(Number);
  const sequence = !!flags.sequence;
  const job: RenderJob = {
    kind: sequence ? 'sequence' : 'still', width, height, spp: +(flags.spp || 64), seed: +(flags.seed || 1),
    format: (flags.format as RenderJob['format']) || (sequence ? 'mp4' : 'png'),
    ...(sequence ? { start: +(flags.start || 0), end: +(flags.end || 1), fps: +(flags.fps || 24) } : flags.time != null ? { time: +flags.time } : {}),
    ...(flags.quality ? { quality: String(flags.quality) } : {}),
    ...(flags.name ? { name: String(flags.name) } : {}),
  };
  const outDir = path.resolve(String(flags.out || path.join(os.homedir(), 'data/pbr-spark/renders', preset)));
  const r = await renderPreset({ preset, params, job, engine: typeof flags.engine === 'string' ? flags.engine : undefined, backend: (flags.backend as 'webgpu' | 'webgl2') || 'webgpu', outDir, allowSoftware: !!flags['allow-software'] });
  const samples = job.spp * (sequence ? Math.round(((job.end! - job.start!) * job.fps!)) + 1 : 1);
  console.log(`done in ${(r.ms / 1000).toFixed(1)} s (${(samples / (r.ms / 1000)).toFixed(1)} spp/s incl. encode) → ${r.files.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(String(e.message || e)); process.exit(1); });
