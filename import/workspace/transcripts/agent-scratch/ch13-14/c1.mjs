import { compile, ir } from './lib.mjs';
const code = process.argv[2];
const r = await compile(code);
const p = r.program;
if (!r.ok) console.log('ERR', r.error);
for (const s of p?.sketches || []) { console.log(await ir(s.id)); }
for (const d of p?.decisions || []) console.log('decision', d.at, d.kind, '→', d.chose, '·', d.reason);
for (const d of p?.diagnostics || []) console.log(d.level, d.kind, d.message, d.fix ? '· fix: ' + d.fix : '');
