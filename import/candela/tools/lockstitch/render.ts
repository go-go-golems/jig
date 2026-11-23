// npx tsx tools/lockstitch/render.ts [--scenes 1,3,7] [--size 1280x720] [--spp 32] [--fps 24] [--stitch 2] [--turns 1]
//   [--format mp4|webm|png|exr] [--still [--time s]] [--backend webgpu|webgl2] [--out dir] [--orbit deg-per-stitch]
//   [--name file-stem] [--quality high] [--allow-software] [--engine browser|rt]
// Renders the Lockstitch head preset (K-09) headless on the GPU: each scene as a video (or a still with --still). The
// scene, stitch length and orbit are set as K-09's params (`scene`, `stitch`, `orbit`) — no source patching.
//   --engine browser (default): the workbench's own render queue in headless Chromium (scripts/render-preset.ts), one
//     browser session for all scenes; needs `npm run build` first.
//   --engine rt: candela-rt (native/rt, CANDELA-002) — the same scene program translated to CUDA, traced with OptiX
//     on the RT cores, the workbench's display program, NVENC video; needs `npx tsx scripts/bundle-core.ts` and the
//     candela-rt build (build/rt). Phase 4 measured S-07 at 1080p, 64 spp: 45 s per stitch against ~234 s.
// Default output: ~/data/pbr-spark/lockstitch/.
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openSession, parseArgs, renderWith, type RenderJob } from '../../scripts/render-preset';

export const SCENES = ['S-01 Needle bar', 'S-02 Take-up lever', 'S-03 Rotary hook', 'S-04 Four-motion feed', 'S-05 Thread path', 'S-06 Zigzag', 'S-07 Whole head'];

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const arg = (k: string, d: string) => (flags[k] == null || flags[k] === true ? d : String(flags[k]));
  const pick = arg('scenes', '1,2,3,4,5,6,7').split(',').map(n => SCENES[+n - 1]).filter(Boolean);
  const [W, H] = arg('size', '1280x720').split('x').map(Number);
  const spp = +arg('spp', '32'), fps = +arg('fps', '24'), stitch = +arg('stitch', '2'), turns = +arg('turns', '1'), orbit = +arg('orbit', '0');
  const still = !!flags.still, fmt = arg('format', still ? 'png' : 'mp4') as RenderJob['format'];
  const outDir = path.resolve(arg('out', path.join(os.homedir(), 'data/pbr-spark/lockstitch')));
  if (arg('engine', 'browser') === 'rt') return renderRt({ pick, W, H, spp, fps, stitch, turns, orbit, still, fmt, outDir, flags, arg });
  const session = await openSession({ backend: arg('backend', 'webgpu') as 'webgpu' | 'webgl2' });
  let failed = 0;
  try {
    for (const sc of pick) {
      const span = sc.startsWith('S-06') ? 2 : 1, dur = stitch * span * turns;
      const name = flags.name && pick.length === 1 ? String(flags.name) : sc.slice(0, 4) + '-' + sc.slice(5).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const job: RenderJob = still
        ? { kind: 'still', width: W, height: H, spp, seed: 1, format: fmt, time: +arg('time', String(stitch * 0.35)), name }
        : { kind: 'sequence', width: W, height: H, spp, seed: 1, format: fmt, start: 0, end: dur - 1 / fps, fps, quality: arg('quality', 'high'), name };
      try {
        const r = await renderWith(session, {
          preset: 'K-09', params: { scene: sc, stitch, orbit }, job, outDir, allowSoftware: !!flags['allow-software'], log: m => console.log(m),
        });
        const st = r.stats as { triangles?: number; materials?: number } | null;
        console.log(`${sc}: ${r.files.map(f => path.basename(f)).join(', ')} · ${st ? `${st.triangles} tris, ${st.materials} materials` : ''} · render ${(r.ms / 1000).toFixed(1)} s`);
      } catch (e) {
        failed++;
        console.log(`${sc}: FAILED ${(e as Error).message}`);
      }
    }
  } finally { await session.close(); }
  console.log(`→ ${outDir}`);
  if (failed) process.exit(1);
}

// one candela-rt process per scene (each builds the scene once, then renders its frames)
function renderRt(o: { pick: string[]; W: number; H: number; spp: number; fps: number; stitch: number; turns: number; orbit: number; still: boolean; fmt: string; outDir: string; flags: Record<string, unknown>; arg: (k: string, d: string) => string }) {
  const bin = path.resolve(o.arg('rt', 'build/rt/candela-rt'));
  let failed = 0;
  for (const sc of o.pick) {
    const span = sc.startsWith('S-06') ? 2 : 1, dur = o.stitch * span * o.turns;
    const name = o.flags.name && o.pick.length === 1 ? String(o.flags.name) : sc.slice(0, 4) + '-' + sc.slice(5).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const time = o.still ? ['--time', o.arg('time', String(o.stitch * 0.35))] : ['--sequence', '--start', '0', '--end', String(dur - 1 / o.fps), '--fps', String(o.fps)];
    const args = ['render', 'K-09', '--param', `scene=${sc}`, '--param', `stitch=${o.stitch}`, '--param', `orbit=${o.orbit}`, ...time,
      '--spp', String(o.spp), '--size', `${o.W}x${o.H}`, '--format', o.fmt === 'webm' ? 'mp4' : o.fmt, '--quality', o.arg('quality', 'high'), '--out', o.outDir, '--name', name];
    const t0 = Date.now();
    const r = spawnSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    const summary = (r.stdout || '').split('\n').filter(l => l.startsWith('K-09')).pop() || '';
    if (r.status !== 0) { failed++; console.log(`${sc}: FAILED (exit ${r.status})`); continue; }
    console.log(`${sc}: ${name}.${o.still ? o.fmt : 'mp4'} · ${((Date.now() - t0) / 1000).toFixed(1)} s · ${summary.replace(/^K-09 /, '').replace(/ → .*$/, '')}`);
  }
  console.log(`→ ${o.outDir}`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(String(e.message || e)); process.exit(1); });
