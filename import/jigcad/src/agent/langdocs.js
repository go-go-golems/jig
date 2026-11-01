// The language reference (content/docs/reference.md) read as records for help() (JIG-012 phase 3). Its bullets
// have one shape: "- `sig` `sig2` ✓: what it does. Example: `code`." A sig names j paths (`j.fit.hole(d, class)`),
// bare names (`mm cm m`) or methods (`.extrude(profile, extent, …)`, `r.union(o)`); the section a method bullet is in
// says whose method it is (Sketches → sketch, Parts and features → part, …).
//
//   parseLangDocs(md) → { paths: Map('j.fit.hole' → rec), bare: Map('mm' → rec), methods: Map(kind → Map(name → rec)) }
//   rec: { sig, status ('✓' | '◐' | …), about, example, section }

const SECTION_KIND = [
  [/^Units|^Expressions/, 'quantity'],
  [/^Patterns/, 'pattern'],
  [/^Regions/, 'region'],
  [/^Sketches/, 'sketch'],
  [/^Parts/, 'part'],
  [/^Selectors/, 'selector'],
  [/^Print/, 'print job'],
  [/^Assemblies/, 'assembly'],
  [/^Explore/, 'design'],
  [/^The Program/, 'program'],
];

// split a sig group into its names at depth 0: "j.q.sqrt sin cos" → ['j.q.sqrt', 'sin', 'cos']; "r.union(o) r.on(p)"
function names(group) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of group) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map(t => t.replace(/[(=].*$/s, '')).filter(t => /^[A-Za-z_.$][\w.$]*$/.test(t));
}

export function parseLangDocs(md) {
  const paths = new Map(), bare = new Map(), methods = new Map();
  let section = '';
  for (const line of String(md).split('\n')) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) { section = h[1].trim(); continue; }
    const m = /^- ((?:`[^`]+`\s*)+)\s*([✓◐✗○]?)[^:]*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const groups = [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]);
    const [about, example] = m[3].split(/\s*Example:\s*/);
    const rec = { sig: groups.join(' '), status: m[2] || '', about: about.trim(), example: example ? example.replace(/\.$/, '').trim() : '', section };
    const kind = SECTION_KIND.find(([re]) => re.test(section))?.[1] ?? null;
    for (const g of groups) {
      const ns = names(g);
      const first = ns[0] ?? '';
      const parent = first.startsWith('j.') ? first.slice(0, first.lastIndexOf('.')) : null;
      for (const n of ns) {
        if (n.startsWith('j.')) paths.set(n, rec);
        else if (parent && !n.includes('.')) paths.set(`${parent}.${n}`, rec);
        else if (/^\w?\./.test(n) && kind) {
          const name = n.replace(/^\w?\./, '');
          if (!methods.has(kind)) methods.set(kind, new Map());
          if (!methods.get(kind).has(name)) methods.get(kind).set(name, rec);
        } else if (!n.includes('.')) bare.set(n, rec);
      }
    }
  }
  return { paths, bare, methods };
}

/** One line for a record: "sig — about". */
export const docLine = rec => `${rec.sig}${rec.status === '◐' ? ' (partly)' : ''}: ${rec.about}${rec.example ? ` Example: ${rec.example}` : ''}`;
