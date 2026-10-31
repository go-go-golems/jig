// Compile every ```figure and ```sketch block of the book's chapters in Node with the real engine, and print what
// the Book view would show: kind, DOF and status of each sketch, profiles and their areas, bodies, faces, volume,
// errors and warnings, compile time. Also checks the house rules: code lines at most 80 characters, lab: links to
// presets, chapters and docs that exist, frontmatter (part, presets, docs) and an h1 in every chapter, and maths
// ($…$, $$…$$) that src/ui/markdown.js can set as Unicode. A ```sketch block that fails on purpose says so with a
// comment line `// expect: <diagnostic kind>`; ```js blocks are listings and are not compiled.
// Usage: node tools/book-check.mjs [11 | 11-constraints.md | path …] [--ir L3,L4] [--detail] [--quiet]
//   --detail prints each sketch's L3 node dump (solver, iterations, rank, equations), the decisions and body topology.
// Exit code 1 on any failing block or broken rule.
import { register } from 'node:module';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
register(new URL('../test/engine/loader.mjs', import.meta.url).href);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOK = join(ROOT, 'content/book');
const args = process.argv.slice(2);
const irArg = args.find(a => a.startsWith('--ir'));
const irLevels = irArg ? (irArg.includes('=') ? irArg.split('=')[1] : args[args.indexOf(irArg) + 1] || 'L3').split(',') : [];
const quiet = args.includes('--quiet'), detail = args.includes('--detail');
const picks = args.filter(a => !a.startsWith('--') && !/^L\d(,L\d)*$/.test(a));

const all = readdirSync(BOOK).filter(f => /^\d\d-.*\.md$/.test(f)).sort();
const chapters = picks.length ? all.filter(f => picks.some(p => f === basename(p) || f.startsWith(String(p).padStart(2, '0') + '-'))) : all;
const presetIds = new Set(readdirSync(join(ROOT, 'content/presets')).filter(d => statSync(join(ROOT, 'content/presets', d)).isDirectory()).map(d => d.split('-').slice(0, 2).join('-')));
const chapterNums = new Set(all.map(f => +f.slice(0, 2)));
const docIds = new Set(readdirSync(join(ROOT, 'content/docs')).map(f => f.replace(/\.md$/, '')));

const { texToText } = await import('../src/ui/markdown.js');
const W = await import('../src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
let bad = 0, n = 0;
const fmt = x => (typeof x === 'number' ? +x.toFixed(3) : x);

for (const f of chapters) {
  const text = readFileSync(join(BOOK, f), 'utf8');
  const problems = [];
  if (!/^---\n[\s\S]*?part:.*\n[\s\S]*?---\n/.test(text)) problems.push('frontmatter with part: missing');
  if (!/^# /m.test(text)) problems.push('no h1 title');
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] || '';
  for (const id of (/presets:\s*(.*)/.exec(fm)?.[1] || '').split(',').map(s => s.trim()).filter(Boolean)) if (!presetIds.has(id)) problems.push(`frontmatter preset ${id} does not exist`);
  for (const id of (/docs:\s*(.*)/.exec(fm)?.[1] || '').split(',').map(s => s.trim()).filter(Boolean)) if (!docIds.has(id)) problems.push(`frontmatter doc ${id} does not exist`);
  for (const m of text.matchAll(/lab:preset[/?](?:id=)?([A-Z]-\d\d)/g)) if (!presetIds.has(m[1])) problems.push(`link to missing preset ${m[1]}`);
  for (const m of text.matchAll(/lab:book[/?](?:ch=)?(\d+)/g)) if (!chapterNums.has(+m[1])) problems.push(`link to missing chapter ${m[1]}`);
  for (const m of text.matchAll(/lab:doc[/?](?:id=)?([a-z-]+)/g)) if (!docIds.has(m[1])) problems.push(`link to missing doc ${m[1]}`);
  // maths is set as Unicode (no KaTeX): a command the converter does not know, or a super/subscript it cannot set,
  // shows as raw text in the Book
  const maths = [...text.matchAll(/\$\$([\s\S]*?)\$\$/g)].map(m => m[1]).concat([...text.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').matchAll(/\$([^$\n]+)\$/g)].map(m => m[1]));
  for (const m of maths) {
    const out = texToText(m);
    if (/\\[A-Za-z]/.test(out) || /[\^_]/.test(out)) problems.push(`maths will not set cleanly: $${m.trim().slice(0, 70)}$ → ${out.trim().slice(0, 70)}`);
  }
  console.log(`\n== ${f}`);
  for (const p of problems) { console.log(`   RULE ${p}`); bad++; }
  const blocks = [...text.matchAll(/```(figure|sketch|js)\n([\s\S]*?)```/g)];
  for (const b of blocks) {
    const kind = b[1], code = b[2];
    const line = text.slice(0, b.index).split('\n').length;
    code.split('\n').forEach((l, i) => { if (l.length > 80) { console.log(`   RULE ${kind} at line ${line}: code line ${i + 1} is ${l.length} characters (max 80)`); bad++; } });
    if (kind === 'js') continue;                     // plain listings are not compiled
    n++;
    const title = /^\/\/ title: (.*)$/m.exec(code)?.[1] || /^\/\/ view: (.*)$/m.exec(code)?.[1] || '';
    const t0 = performance.now();
    let r;
    try { r = await W.handle({ id: n, op: 'compile', files: { 'script.js': code }, entry: 'script.js', options: {} }); }
    catch (e) { r = { ok: false, error: { message: e.message } }; }
    const ms = Math.round(performance.now() - t0);
    const p = r.program;
    const errs = (p?.diagnostics || []).filter(d => d.level === 'error');
    const warns = (p?.diagnostics || []).filter(d => d.level === 'warning');
    // a sketch block may fail on purpose ("read the diagnostic"): `// expect: <kind>` in it says which error
    const expect = kind === 'sketch' ? /^\/\/ expect: (\S+)/m.exec(code)?.[1] : null;
    const compiled = r.ok && p && p.ok !== false;
    const ok = expect ? !!p && errs.some(e => e.kind === expect) : compiled && !errs.length;
    if (!ok) bad++;
    const s = p?.summary || {};
    const parts = [`${kind} @${line}`, title && `"${title}"`, `${ms} ms`, p?.kind];
    if ((p?.bodies || []).length) parts.push(`${p.bodies.length} bod${p.bodies.length === 1 ? 'y' : 'ies'}, ${s.faces} faces, volume ${fmt(s.volume)} mm³`);
    if (expect) parts.push(`expects ${expect}`);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${parts.filter(Boolean).join(' · ')}${ms > 3000 ? ' · SLOW (the Book compiles figures in the page)' : ''}`);
    if (!r.ok) console.log(`     error: ${r.error?.message} (line ${r.error?.line ?? '?'})`);
    for (const sk of p?.sketches || []) {
      const prof = (sk.profiles || []).map(x => fmt(x.area)).join(', ');
      console.log(`     sketch ${sk.id}: ${sk.status}, dof ${sk.dof}${sk.conflicts?.length ? `, conflicts ${JSON.stringify(sk.conflicts)}` : ''}${prof ? `, profile areas ${prof} mm²` : ''}${sk.entities ? `, ${sk.entities.length} entities, ${sk.constraints.length} constraints` : ''}`);
    }
    for (const e of errs) console.log(`     error ${e.kind} at ${e.at ?? '?'}: ${e.message}${e.fix ? ' · fix: ' + e.fix : ''}`);
    if (!quiet) for (const w of warns) console.log(`     warning ${w.kind} at ${w.at ?? '?'}: ${w.message}`);
    for (const L of irLevels) if (p?.ir?.[L]) console.log(String(p.ir[L]).split('\n').map(x => `     ${L} | ${x}`).join('\n'));
    if (detail && p) {
      // what the IR view shows for each sketch node, and the compiler's decisions (solver, iterations, modes, ops)
      for (const sk of p.sketches || []) {
        const d = await W.handle({ id: ++n * 1000, op: 'call', method: 'ir', args: ['L3', { node: sk.id }] });
        if (d?.ok && d.value) console.log(String(d.value).split('\n').map(x => `     IR | ${x}`).join('\n'));
      }
      for (const d of p.decisions || []) console.log(`     decision ${d.at} ${d.kind} → ${d.chose}${d.reason ? ' · ' + d.reason : ''}`);
      for (const b of p.bodies || []) if (b.topology) console.log(`     topology ${b.id}: ${JSON.stringify(b.topology)}`);
    }
  }
}
console.log(`\n${n} blocks compiled · ${bad ? `${bad} problem${bad === 1 ? '' : 's'}` : 'no problems'}`);
process.exit(bad ? 1 : 0);
