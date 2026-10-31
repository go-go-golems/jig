import { W } from './lib.mjs';
const code = process.argv[2];
const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': code } });
for (const L of (process.argv[3] ?? 'L4').split(',')) console.log(r.program.ir[L]);
