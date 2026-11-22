// scripts/live-client.ts — drive `candela-rt serve` without a browser (CANDELA-002 phase 5): connect, send a preset's
// files, a view, optional param changes and a play/pause of the clock, and save the frames that come back.
//   npx tsx scripts/live-client.ts <presetId> [--url ws://localhost:8790] [--size 960x540] [--param id=value]…
//       [--play 2] [--seconds 6] [--out dir]
// Prints one line per message; frames land in <out>/<id>-<n>.jpg (the last of each epoch, and the very last).
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogFromDisk } from '../src/content/node';
import { parseArgs } from './render-preset';

async function main() {
  const { flags, params: rawParams, rest } = parseArgs(process.argv.slice(2));
  const id = rest[0];
  if (!id) throw new Error('usage: live-client.ts <presetId> [--url ws://localhost:8790] [--size 960x540] [--param id=value]… [--play s] [--seconds s]');
  const preset = loadCatalogFromDisk().presets.find(p => p.id === id);
  if (!preset) throw new Error(`no preset ${id}`);
  const url = String(flags.url || 'ws://localhost:8790');
  const [W, H] = String(flags.size || '960x540').split('x').map(Number);
  const out = path.resolve(String(flags.out || 'build/live'));
  fs.mkdirSync(out, { recursive: true });
  const seconds = +(flags.seconds || 6), play = flags.play != null ? +flags.play : 0;
  const params: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawParams)) params[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;

  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  const t0 = Date.now(), stamp = () => ((Date.now() - t0) / 1000).toFixed(2).padStart(6);
  let frames = 0, lastJpg: Uint8Array | null = null, lastHead: any = null, epoch = -1, firstFrameAt = 0, builtAt = 0;
  const saveLast = (tag: string) => { if (lastJpg) { const f = path.join(out, `${id}-${tag}.jpg`); fs.writeFileSync(f, lastJpg); return f; } return ''; };
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'hello' }));
    ws.send(JSON.stringify({ type: 'view', view: null, width: W, height: H }));
    ws.send(JSON.stringify({ type: 'files', files: preset.files, params, time: (preset as any).time || 0, seed: 1 }));
  };
  ws.onmessage = ev => {
    if (typeof ev.data === 'string') {
      const m = JSON.parse(ev.data);
      if (m.type === 'built') builtAt = Date.now();
      console.log(`${stamp()} ${m.type} ${JSON.stringify(m).slice(0, 220)}`);
      return;
    }
    const b = new Uint8Array(ev.data as ArrayBuffer);
    const hl = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
    const head = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + hl)));
    if (head.epoch !== epoch && lastHead) saveLast(`e${lastHead.epoch}`);
    epoch = head.epoch; lastHead = head; lastJpg = b.subarray(4 + hl); frames++;
    if (!firstFrameAt) { firstFrameAt = Date.now(); console.log(`${stamp()} first frame ${builtAt ? Date.now() - builtAt : '?'} ms after built`); }
    if (frames % 10 === 1 || head.spp >= 2048) console.log(`${stamp()} frame #${frames} epoch ${head.epoch} t=${head.t.toFixed(3)} spp ${head.spp} ev ${head.ev.toFixed(2)} ${head.width}x${head.height} ${lastJpg.length} B${head.denoise ? ` · denoise ${head.denoise} ${head.denoiseMs} ms` : ''}`);
  };
  ws.onerror = e => { console.error('websocket error', (e as any).message || e); };
  await new Promise<void>(res => ws.addEventListener('open', () => res(), { once: true }));
  // the script: let it converge, change a param, play for a while, pause
  await sleep(seconds * 1000 / 2);
  const dyn = Object.keys(params).length ? null : flags.tweak ? String(flags.tweak) : null;
  if (dyn) { const [k, v] = dyn.split('='); console.log(`${stamp()} → param ${k}=${v}`); ws.send(JSON.stringify({ type: 'param', id: k, value: isNaN(+v) ? v : +v })); await sleep(1500); }
  if (play > 0) {
    console.log(`${stamp()} → play`); ws.send(JSON.stringify({ type: 'clock', t: lastHead ? lastHead.t : 0, playing: true, rate: 1 }));
    const n0 = frames; await sleep(play * 1000);
    console.log(`${stamp()} → pause (${frames - n0} frames in ${play} s while playing)`); ws.send(JSON.stringify({ type: 'clock', t: lastHead ? lastHead.t : 0, playing: false }));
  }
  await sleep(seconds * 1000 / 2);
  const f = saveLast('last');
  console.log(`${stamp()} ${frames} frames; last: spp ${lastHead && lastHead.spp}, t=${lastHead && lastHead.t.toFixed(3)} → ${f}`);
  ws.close();
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
