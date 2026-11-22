// scripts/core-digest.ts — the Node half of the cross-engine check (CANDELA-002 design doc 02, phase 0).
//
//   npx tsx scripts/core-digest.ts [--ids B-01,K-09] [--times 0,0.37,1.5] [--json out.json] [--compare other.json…]
//
// Loads dist-core/candela-core.js (scripts/bundle-core.ts) into a fresh `vm` context that has only the globals
// candela-rt provides (console, performance.now, atob, btoa), digests the presets exactly as `candela-rt digest`
// does, and optionally compares the result with one or more digest files (from candela-rt, or another Node run).
// A preset matches when its WGSL hash, line count, uniform count and every buffer hash at every time are equal.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parseArgs } from './args';

type Digest = { id: string; ok: boolean; error?: string; shared?: string; lines?: number; nU?: number; frames?: { t: number; d: Record<string, string> }[]; buildMs?: number; frameMs?: number };

export function readContent(dir: string, base = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, readContent(dir, rel));
    else out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return out;
}

export async function digestInVm(bundle: string, content: Record<string, string>, ids: string[], times: number[]): Promise<Digest[]> {
  const ctx = vm.createContext({
    console,
    performance: { now: () => performance.now() },
    atob: (s: string) => Buffer.from(s, 'base64').toString('latin1'),
    btoa: (s: string) => Buffer.from(s, 'latin1').toString('base64'),
  });
  vm.runInContext(fs.readFileSync(bundle, 'utf8'), ctx, { filename: bundle });
  // JSON round trip: plain data, like candela-rt's JSON.stringify
  return JSON.parse(JSON.stringify(await (ctx as any).Candela.digestCatalog(content, ids, times)));
}

/** compare two digest lists; returns the ids that differ, with the first differing field */
export function compareDigests(a: Digest[], b: Digest[]): { id: string; field: string }[] {
  const byId = new Map(b.map(d => [d.id, d]));
  const diffs: { id: string; field: string }[] = [];
  for (const x of a) {
    const y = byId.get(x.id);
    if (!y) { diffs.push({ id: x.id, field: 'missing' }); continue; }
    if (x.ok !== y.ok) { diffs.push({ id: x.id, field: 'ok' }); continue; }
    if (!x.ok) continue;
    for (const k of ['shared', 'lines', 'nU'] as const) if (x[k] !== y[k]) { diffs.push({ id: x.id, field: k }); break; }
    if (diffs.length && diffs[diffs.length - 1].id === x.id) continue;
    (x.frames || []).forEach((f, i) => {
      const g = y.frames && y.frames[i];
      const bad = !g || g.t !== f.t ? 'times' : Object.keys(f.d).find(k => f.d[k] !== g.d[k]);
      if (bad && !diffs.some(d => d.id === x.id)) diffs.push({ id: x.id, field: `t=${f.t} ${bad}` });
    });
  }
  return diffs;
}

/** --session: the moving presets stepped frame by frame (Candela.sessionCatalog), compared per frame with --compare */
async function sessionMode(flags: Record<string, string | boolean>, ids: string[]) {
  const frames = +(flags.frames || 48), fps = +(flags.fps || 24);
  const ctx = vm.createContext({ console, performance: { now: () => performance.now() }, atob: (s: string) => Buffer.from(s, 'base64').toString('latin1') });
  vm.runInContext(fs.readFileSync('dist-core/candela-core.js', 'utf8'), ctx);
  const res = JSON.parse(JSON.stringify(await (ctx as any).Candela.sessionCatalog(readContent(path.resolve('content')), ids, { fps, frames })));
  console.log(`node ${process.version}: ${res.filter((r: any) => r.ok).length}/${res.length} moving presets stepped (${frames} frames at ${fps} fps)`);
  if (typeof flags.json === 'string') fs.writeFileSync(flags.json, JSON.stringify(res) + '\n');
  if (typeof flags.compare === 'string') {
    const other = new Map((JSON.parse(fs.readFileSync(flags.compare, 'utf8')) as any[]).map(r => [r.id, r]));
    const diffs = res.filter((r: any) => { const o: any = other.get(r.id); return !o || JSON.stringify(r.frames) !== JSON.stringify(o.frames); }).map((r: any) => r.id);
    console.log(`compare with ${flags.compare}: ${res.length - diffs.length}/${res.length} identical frame by frame${diffs.length ? '; differ: ' + diffs.join(', ') : ''}`);
  }
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const ids = typeof flags.ids === 'string' ? flags.ids.split(',').filter(Boolean) : [];
  const times = String(flags.times || '0,0.37,1.5').split(',').map(Number);
  if (flags.session) { await sessionMode(flags, ids); return; }
  const res = await digestInVm(path.resolve('dist-core/candela-core.js'), readContent(path.resolve('content')), ids, times);
  const ok = res.filter(r => r.ok).length;
  console.log(`node ${process.version}: ${ok}/${res.length} presets built`);
  for (const r of res.filter(r => !r.ok)) console.log(`  ${r.id} FAILED ${r.error}`);
  if (typeof flags.json === 'string') fs.writeFileSync(flags.json, JSON.stringify(res) + '\n');
  const others = process.argv.slice(2).flatMap((a, i, all) => (all[i - 1] === '--compare' ? [a] : []));
  for (const f of others) {
    const diffs = compareDigests(res, JSON.parse(fs.readFileSync(f, 'utf8')));
    console.log(`compare with ${f}: ${res.length - diffs.length}/${res.length} identical${diffs.length ? '; differ: ' + diffs.map(d => `${d.id} (${d.field})`).join(', ') : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
