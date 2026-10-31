import { compile } from './h.mjs';
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/claude/jigcad/content/presets/M-09-rack-and-pinion/script.js', 'utf8');
const show = (p, lab) => console.log(lab, p.decisions.filter(d => d.kind === 'gap').map(d => d.at + ' ' + d.chose).join(' | '), '\n   ', p.diagnostics.map(d => d.level + ' ' + d.kind + ' ' + d.at + ': ' + d.message).join('\n    '), '\n   ', p.trace.filter(t => t.pass === 'interference').map(t => t.note).join());
let t0 = performance.now();
const p = await compile(src); console.log((performance.now() - t0).toFixed(0), 'ms'); show(p, 'as is');
const noLead = src.replace(/\s*\.chamfer\(j\.feat\('bore'\)[\s\S]*?\{ id: 'lead-in' \}\)/, '');
console.log(noLead.includes('lead-in') ? 'replace failed' : 'lead-in removed');
t0 = performance.now();
const q = await compile(noLead); console.log((performance.now() - t0).toFixed(0), 'ms'); show(q, 'no lead-in');
const ex = src.replace('.interference()', '.interference({ exact: true })');
t0 = performance.now();
const r = await compile(ex); console.log((performance.now() - t0).toFixed(0), 'ms'); show(r, 'exact');
// base part volume and peg-root info
const base = p.bodies.find(b => b.id.startsWith('base/'));
console.log(base.id, base.volume, base.faces.filter(f => /peg|tip/.test(f.name)).map(f => f.name + ':' + f.kind));
const pin = p.bodies.find(b => b.id.startsWith('pinion/'));
console.log(pin.id, pin.faces.filter(f => /lead|bore|hub-root/.test(f.name)).map(f => f.name + ':' + f.kind + ' ' + (f.axis ? JSON.stringify(f.axis) : '')));
