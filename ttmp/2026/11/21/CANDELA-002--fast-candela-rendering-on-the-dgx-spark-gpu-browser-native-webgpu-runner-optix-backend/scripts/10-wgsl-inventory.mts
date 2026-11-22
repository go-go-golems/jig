// 10-wgsl-inventory.mts — which WGSL constructs do Candela's generated programs use? Builds every preset, collects
// constructs from compiled.shared (the kernel + generated code) and from the display program, and prints counts:
// the coverage list for wgsl2cuda (CANDELA-002 design doc 02, phase 2). Run: npx tsx <this file>
import { build } from '../../../../../../src/engine/candela';
import { loadCatalogFromDisk } from '../../../../../../src/content/node';
import { POST } from '../../../../../../src/engine/kernel';

const presets = loadCatalogFromDisk().presets;
const count = new Map<string, Set<string>>();       // construct → presets using it
const add = (k: string, id: string) => { if (!count.has(k)) count.set(k, new Set()); count.get(k)!.add(id); };
const fnDefs = new Set<string>(), calls = new Map<string, Set<string>>();
let maxLines = 0;
for (const p of presets) {
  const r: any = await build(p.files);
  if (!r.ok) { console.log('build failed', p.id); continue; }
  const src: string = r.compiled.shared + '\n' + POST;
  maxLines = Math.max(maxLines, src.split('\n').length);
  for (const m of src.matchAll(/^\s*fn\s+(\w+)/gm)) fnDefs.add(m[1]);
  for (const m of src.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) { if (!calls.has(m[1])) calls.set(m[1], new Set()); calls.get(m[1])!.add(p.id); }
  const pats: [string, RegExp][] = [
    ['generic vecN<T>', /\bvec[234]<\w+>/], ['matrix type', /\bmat\dx\d/], ['switch', /\bswitch\b/], ['continuing', /\bcontinuing\b/],
    ['break if', /\bbreak\s+if\b/], ['while', /\bwhile\b/], ['ptr<', /\bptr</], ['array ctor', /\barray<[^>]+>\(/],
    ['array var', /\bvar\s+\w+\s*:\s*array</], ['private array', /var<private>\s+\w+\s*:\s*array/], ['private scalar', /var<private>\s+\w+\s*:\s*(?!array)/],
    ['bitcast', /\bbitcast</], ['float %', /[\w)\]]\s*%\s*[\w(]/], ['swizzle xyzw 2-4', /\.[xyzw]{2,4}\b/], ['swizzle rgba', /\.[rgba]{2,4}\b/],
    ['swizzle assign', /\.[xyzw]{2,4}\s*=[^=]/], ['compound assign', /[+\-*\/]=/], ['++/--', /\+\+|--/], ['literal suffix f', /\d\.?\d*f\b/],
    ['literal suffix u', /\b\d+u\b/], ['literal suffix i', /\b\d+i\b/], ['hex literal', /0x[0-9a-fA-F]+/], ['const decl', /^\s*const\s+\w+\s*:/m],
    ['override/alias', /\b(override|alias)\b/], ['atomic', /\batomic</], ['texture', /\btexture\w*\(/], ['struct', /^\s*struct\s+\w+/m],
    ['vector select', /select\([^;]*vec[234][fiu]\(/], ['discard', /\bdiscard\b/], ['@ attribute', /@\w+/],
  ];
  for (const [k, re] of pats) if (re.test(src)) add(k, p.id);
}
console.log(`${presets.length} presets; largest program ${maxLines} lines (shared + POST)`);
for (const [k, s] of [...count].sort((a, b) => b[1].size - a[1].size)) console.log(`  ${k.padEnd(20)} ${String(s.size).padStart(3)} presets${s.size < 8 ? '  (' + [...s].join(' ') + ')' : ''}`);
const builtins = [...calls].filter(([n]) => !fnDefs.has(n) && !/^(vec[234][fiu]?|mat\dx\d\w*|array|bitcast|select|f32|i32|u32|bool|if|for|while|switch|return|loop|fn|struct|vec[234]|var|let)$/.test(n)).map(([n, s]) => `${n}(${s.size})`).sort();
console.log('built-in calls (not defined in the program):', builtins.join(' '));
