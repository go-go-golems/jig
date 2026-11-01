// help(x) in the agent's eval scope (JIG-012 phase 3): what a name or a value is, from the registry (docs.js) for the
// scope and from the language reference (langdocs.js) for j, the units and the methods of the language's values.
//
//   help()              the scope by group, one line per row
//   help('files.read')  the row; help(files.read) finds it by identity
//   help('files')       the rows of a namespace
//   help('j.fit')       a namespace of the language: each member with its line; help(j.fit) the same
//   help('j.fit.hole')  the member's line; help('mm') a unit's
//   help(part)          what the value is and its methods (part, sketch, quantity, selector, …)
// The answer is text; a name that is not known gets the nearest known names.
import { SCOPE_DOCS, GROUPS, scopeDoc, scopeNames } from './docs.js';
import { parseLangDocs, docLine } from './langdocs.js';
import { closest } from '../engine/guard.js';

const strip = s => String(s).replace(/`/g, '');

/** The language's value kinds, from sample values: [{ kind, proto, methods }]. j, bare from the engine. */
export function languageKinds(j, bare) {
  if (!j) return [];
  const out = [];
  const take = (kind, f) => {
    let v; try { v = f(); } catch { return; }
    if (!v || typeof v !== 'object') return;
    const methods = new Set();
    for (let o = Object.getPrototypeOf(v); o && o !== Object.prototype; o = Object.getPrototypeOf(o))
      for (const k of Object.getOwnPropertyNames(o)) {
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!['constructor', 'toString', 'toJSON', 'valueOf'].includes(k) && !k.startsWith('_') && typeof d.value === 'function') methods.add(k);
      }
    out.push({ kind, proto: Object.getPrototypeOf(v), methods: [...methods].sort() });
  };
  take('part', () => j.part('x'));
  take('quantity', () => bare.mm(1));
  take('sketch', () => j.sketch('s'));
  take('region', () => j.region.rect(bare.mm(1), bare.mm(1)));
  take('selector', () => j.sel.faces());
  take('assembly', () => j.assembly('a'));
  take('print job', () => j.print('p'));
  take('design', () => j.design({}, () => j.part('x')));
  return out;
}

/** { kind: [methods] } for hints.js. */
export const methodsByKind = kinds => Object.fromEntries(kinds.map(k => [k.kind, k.methods]));

/**
 * help for one step. scope: the step's scope (after tracking and guarding, so identities match what the code
 * holds); j, bare: the language when the step has it; langMd: content/docs/reference.md; kinds: languageKinds().
 */
export function makeHelp({ scope, j = null, langMd = '', kinds = [] }) {
  let lang = null, idents = null;
  const L = () => (lang ??= parseLangDocs(langMd));
  const identities = () => {
    if (idents) return idents;
    idents = new Map();
    for (const [k, v] of Object.entries(scope)) {
      if (k === 'help') continue;
      if (typeof v === 'function') idents.set(v, k);
      else if (v && typeof v === 'object' && k !== 'data') {
        idents.set(v, k);
        for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'function') idents.set(v2, `${k}.${k2}`);
      }
    }
    if (j) walkJ(j, 'j', 3, idents, new Set());
    return idents;
  };

  function help(x) {
    if (arguments.length === 0 || x === undefined) return overview();
    if (typeof x === 'string') return byName(x.trim());
    if (typeof x === 'function' || (x && typeof x === 'object')) {
      const path = identities().get(x);
      if (path) return byName(path);
      return ofValue(x);
    }
    return `${JSON.stringify(x)} is a ${typeof x}. help() lists this step's scope; help('j') the language.`;
  }

  function overview() {
    const lines = ["This step's scope (help('name') for one; help(j.fit) for the language; help(value) for what a value is):"];
    for (const g of GROUPS) {
      const rows = SCOPE_DOCS.filter(r => r.group === g && (j || r.where !== 'sandbox'));
      if (!rows.length) continue;
      const names = rows.flatMap(r => r.names.length > 3 ? [`${r.names[0].split('.')[0]}.*`] : r.names);
      const ns = names.every(n => n.includes('.')) && new Set(names.map(n => n.split('.')[0])).size === 1 ? names[0].split('.')[0] : null;
      lines.push(`  ${g}: ${ns ? `${ns}.{${names.map(n => n.slice(ns.length + 1)).join(', ')}}` : names.join(', ')}`);
    }
    return lines.join('\n');
  }

  function byName(name) {
    const rec = scopeDoc(name);
    if (rec) return row(rec);
    const ns = SCOPE_DOCS.filter(r => r.names.some(n => n.startsWith(name + '.')));
    if (ns.length) return [`${name}:`, ...ns.map(r => `  ${strip(r.sig)}: ${strip(r.text)}`)].join('\n');
    if (name === 'j' || name.startsWith('j.')) return ofJ(name);
    const b = L().bare.get(name);
    if (b) return docLine(b).replace(/`/g, '');
    const m = /^(?:(\w[\w ]*)\.)?\.?(\w+)$/.exec(name);
    if (m) {
      const hits = [];
      for (const [kind, ms] of L().methods) if ((!m[1] || m[1] === kind) && ms.has(m[2])) hits.push(`${kind}: ${strip(docLine(ms.get(m[2])))}`);
      if (hits.length) return hits.join('\n');
    }
    const known = [...scopeNames(), ...(j ? [...L().paths.keys()] : []), ...L().bare.keys()];
    const near = closest(name, known, 4);
    return `help: no ${name} here.${near.length ? ` Nearest: ${near.join(', ')}.` : ''} help() lists this step's scope.`;
  }

  function row(rec) {
    return `${strip(rec.sig)}${rec.where === 'sandbox' ? ' (sandbox)' : ''}\n  ${strip(rec.text)}`;
  }

  function ofJ(path) {
    const doc = L().paths.get(path);
    let v;
    if (j) {
      v = j;
      for (const k of path.split('.').slice(1)) {
        try { v = v?.[k]; } catch (e) { return `help: ${e.message}`; }
      }
    }
    const members = v && (typeof v === 'object' || typeof v === 'function') ? Object.keys(v).filter(k => !k.startsWith('_')) : [];
    const isNs = members.length > 0 && !(v && typeof v === 'object' && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null);
    const lines = [];
    if (doc) lines.push(strip(docLine(doc)));
    if (isNs) {
      if (!doc) lines.push(`${path}:`);
      const lower = members.filter(k => !/^[A-Z]/.test(k)).sort(), upper = members.filter(k => /^[A-Z]/.test(k)).sort();
      for (const k of lower) {
        const d = L().paths.get(`${path}.${k}`);
        lines.push(`  ${path}.${k}${d ? `: ${strip(d.about).slice(0, 110)}` : ''}`);
      }
      if (upper.length) lines.push(`  classes: ${upper.join(', ')}`);
    }
    if (!lines.length) {
      if (!j) return `help: ${path} is the language, which is in the sandbox's steps; this step ran on the page.`;
      return v === undefined ? `help: no ${path}.` : `${path} is ${describeValue(v)}; the language reference has no line for it.`;
    }
    return lines.join('\n');
  }

  function ofValue(v) {
    const k = kinds.find(x => Object.getPrototypeOf(v) === x.proto);
    if (k) {
      const ms = L().methods.get(k.kind);
      const lines = [`${describeValue(v)} (a ${k.kind}). Its methods:`];
      for (const m of k.methods) {
        const d = ms?.get(m);
        lines.push(`  .${m}()${d ? `: ${strip(d.about).slice(0, 100)}` : ''}`);
      }
      return lines.join('\n');
    }
    return `${describeValue(v)}.`;
  }

  return help;
}

function describeValue(v) {
  if (Array.isArray(v)) return `an array of ${v.length}`;
  if (typeof v === 'function') return `a function ${v.name || ''}`.trim();
  if (v && typeof v === 'object') {
    if (typeof v.toString === 'function' && v.toString !== Object.prototype.toString) { try { const t = String(v); if (!t.startsWith('[object')) return t; } catch { /* fall through */ } }
    const keys = Object.keys(v);
    return `an object with ${keys.length ? keys.slice(0, 12).join(', ') + (keys.length > 12 ? ', …' : '') : 'no keys'}`;
  }
  return String(v);
}

function walkJ(v, path, depth, out, seen) {
  if (depth < 0 || !v || (typeof v !== 'object' && typeof v !== 'function') || seen.has(v)) return;
  seen.add(v);
  if (!out.has(v)) out.set(v, path);
  let keys = [];
  try { keys = Object.keys(v); } catch { return; }
  for (const k of keys) {
    let x; try { x = v[k]; } catch { continue; }
    if (x && (typeof x === 'object' || typeof x === 'function') && !out.has(x)) {
      const p = Object.getPrototypeOf(x);
      if (typeof x === 'function' || p === Object.prototype || p === null) walkJ(x, `${path}.${k}`, depth - 1, out, seen);
    }
  }
}
