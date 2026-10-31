import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
const f = readdirSync(dir).filter(x => x.endsWith('.cpuprofile'))[0];
const p = JSON.parse(readFileSync(dir + '/' + f, 'utf8'));
const byId = new Map(p.nodes.map(n => [n.id, n]));
const self = new Map();
const dt = p.timeDeltas; let total = 0;
for (let i = 0; i < p.samples.length; i++) { const n = byId.get(p.samples[i]); const d = dt[i] / 1000; total += d; self.set(n.id, (self.get(n.id) ?? 0) + d); }
const cat = new Map(), fn = new Map();
for (const [id, ms] of self) {
  const n = byId.get(id), u = n.callFrame.url;
  let c = u.includes('replicad_single') || u.startsWith('wasm') || n.callFrame.functionName.startsWith('$') ? 'occt-wasm' : u.includes('/src/engine/sketch/') ? 'js:sketch' : u.includes('/src/engine/') ? 'js:engine/' + u.split('/src/engine/')[1] : u.includes('vendor/replicad') ? 'js:replicad' : (n.callFrame.functionName || '(native)').startsWith('(') ? n.callFrame.functionName : 'other:' + (u.split('/').pop() || n.callFrame.functionName);
  cat.set(c, (cat.get(c) ?? 0) + ms);
  const k = `${n.callFrame.functionName || '(anon)'} ${u.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`;
  fn.set(k, (fn.get(k) ?? 0) + ms);
}
console.log('total ms', total.toFixed(0));
for (const [c, ms] of [...cat].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log((ms / total * 100).toFixed(1).padStart(5) + '%', ms.toFixed(0).padStart(7), c);
console.log('--- top functions');
for (const [c, ms] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log((ms / total * 100).toFixed(1).padStart(5) + '%', ms.toFixed(0).padStart(7), c);
