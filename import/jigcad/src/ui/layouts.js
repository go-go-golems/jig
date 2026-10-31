// The views and the layouts (layouts-and-dock.md), translated for a CAD program: the guide's seven, plus "The shelf"
// (the Presets view beside the stage and the notes), added with the Presets view.
// A layout is a tree: a tile { t: 'tile', views, active } or a split { t: 'split', dir: 'row' | 'col', kids, sizes }.
export const VIEWS = [
  { id: 'notes', title: 'Notes', about: 'what this preset is about' },
  { id: 'code', title: 'Code', about: 'the preset’s files, editable' },
  { id: 'agent', title: 'Agent', about: 'a coding agent with an eval tool' },
  { id: 'docs', title: 'Docs', about: 'geometry and printing, one topic each' },
  { id: 'book', title: 'Book', about: 'the textbook, with live figures' },
  { id: 'reference', title: 'Reference', about: 'the API, one page' },
  { id: 'stage', title: 'Stage', about: 'the drafting sheet of the part' },
  { id: 'params', title: 'Params', about: 'every parameter, live' },
  { id: 'graph', title: 'Graph', about: 'features by level and what feeds them' },
  { id: 'ir', title: 'IR', about: 'the compiled program as text' },
  { id: 'trace', title: 'Trace', about: 'compile passes and decisions' },
  { id: 'experiments', title: 'Experiments', about: 'design searches, headless' },
  { id: 'presets', title: 'Presets', about: 'every preset on the shelf' },
];
export const VIEW = Object.fromEntries(VIEWS.map(v => [v.id, v]));
const ALL = VIEWS.map(v => v.id);

// where a closed view goes back to when a link needs it: next to the first of these that is open
export const RELATED = {
  code: ['notes', 'agent'], notes: ['code', 'docs'], agent: ['code', 'notes'], docs: ['notes', 'book', 'reference'], book: ['notes', 'docs'],
  reference: ['docs', 'notes'], stage: ['params', 'graph'], params: ['trace', 'graph', 'experiments'], graph: ['ir', 'params'],
  ir: ['graph', 'trace'], trace: ['params', 'ir'], experiments: ['params', 'trace'], presets: ['notes', 'docs', 'book'],
};

const tile = (views, active) => ({ t: 'tile', views, active: active ?? views[0] });
const split = (dir, kids, sizes) => ({ t: 'split', dir, kids, sizes });
const READING = ['notes', 'code', 'agent', 'docs', 'book', 'reference'];
const PANELS = ['params', 'trace', 'graph', 'ir', 'experiments'];

export const LAYOUTS = [
  { id: 'code-stage', title: 'Code beside the stage', about: 'reading and code left; the stage over the panels',
    tree: split('row', [tile(READING), split('col', [tile(['stage']), tile(PANELS)], [0.68, 0.32])], [0.36, 0.64]) },
  { id: 'stage-first', title: 'Stage first', about: 'the stage over params and trace; everything else right',
    tree: split('row', [split('col', [tile(['stage']), tile(['params', 'trace'])], [0.66, 0.34]), tile([...READING, 'graph', 'ir', 'experiments'], 'code')], [0.64, 0.36]) },
  { id: 'program', title: 'The program: code, graph, IR', about: 'three columns: code, the graph and IR, the stage',
    tree: split('row', [tile(['code', 'notes', 'agent', 'docs', 'book', 'reference']), tile(['graph', 'ir']), split('col', [tile(['stage']), tile(['params', 'trace', 'experiments'])], [0.52, 0.48])], [0.34, 0.33, 0.33]) },
  { id: 'notes', title: 'Reading the notes', about: 'the notes and the shelf left; the stage over the rest',
    tree: split('row', [tile(['notes', 'presets', 'docs', 'book', 'reference']), split('col', [tile(['stage']), tile(['params', 'code', 'agent', 'trace', 'graph', 'ir', 'experiments'])], [0.62, 0.38])], [0.46, 0.54]) },
  { id: 'experiments', title: 'Experiments and traces', about: 'code left; experiments and params over the trace',
    tree: split('row', [tile(READING, 'code'), split('col', [tile(['experiments', 'params']), tile(['trace', 'stage', 'graph', 'ir'], 'stage')], [0.5, 0.5])], [0.4, 0.6]) },
  { id: 'book', title: 'Reading the book', about: 'half and half: the book, and the stage over the rest',
    tree: split('row', [tile(['book', 'notes', 'docs', 'reference']), split('col', [tile(['stage']), tile(['params', 'code', 'agent', 'trace', 'graph', 'ir', 'experiments'])], [0.62, 0.38])], [0.5, 0.5]) },
  { id: 'shelf', title: 'The shelf', about: 'every preset left; the stage over the notes and code',
    tree: split('row', [tile(['presets', 'docs', 'book', 'reference']), split('col', [tile(['stage']), tile(['notes', 'code', 'agent', 'params', 'trace', 'graph', 'ir', 'experiments'])], [0.56, 0.44])], [0.5, 0.5]) },
  { id: 'one', title: 'Everything in one tile', about: 'all thirteen views as tabs, the stage in front',
    tree: tile(['stage', ...ALL.filter(v => v !== 'stage')], 'stage') },
];

let uid = 0;
export const newId = p => `${p}${++uid}`;

/** Clean a stored or shipped layout: unknown and duplicate views go, empty tiles and one-child splits collapse,
 *  same-direction splits merge, sizes sum to 1. The root may be an empty tile (it shows the picker). */
export function normalise(tree, keepEmpty = false) {
  const seen = new Set();
  const walk = (n, root) => {
    if (!n || typeof n !== 'object') return null;
    if (n.t === 'tile') {
      const views = (Array.isArray(n.views) ? n.views : []).filter(v => ALL.includes(v) && !seen.has(v) && seen.add(v));
      if (!views.length && !(root || (keepEmpty && n.keep))) return null;
      return { t: 'tile', id: n.id || newId('t'), views, active: views.includes(n.active) ? n.active : views[0] ?? null, keep: n.keep };
    }
    if (n.t === 'split') {
      const dir = n.dir === 'col' ? 'col' : 'row';
      let kids = [], sizes = [];
      (n.kids || []).forEach((k, i) => {
        const c = walk(k, false);
        if (!c) return;
        const s = Math.max(0.01, +(n.sizes?.[i]) || 1 / n.kids.length);
        if (c.t === 'split' && c.dir === dir) { c.kids.forEach((cc, j) => { kids.push(cc); sizes.push(s * c.sizes[j]); }); }
        else { kids.push(c); sizes.push(s); }
      });
      if (!kids.length) return root ? { t: 'tile', id: newId('t'), views: [], active: null } : null;
      if (kids.length === 1) return kids[0];
      const sum = sizes.reduce((a, b) => a + b, 0);
      return { t: 'split', id: n.id || newId('s'), dir, kids, sizes: sizes.map(s => s / sum) };
    }
    return null;
  };
  return walk(tree, true) || { t: 'tile', id: newId('t'), views: [], active: null };
}

export const clone = t => JSON.parse(JSON.stringify(t));
export function tiles(tree, out = []) { if (tree.t === 'tile') out.push(tree); else tree.kids.forEach(k => tiles(k, out)); return out; }
export const openViews = tree => tiles(tree).flatMap(t => t.views);
export const findTile = (tree, id) => tiles(tree).find(t => t.id === id);
export const tileOf = (tree, view) => tiles(tree).find(t => t.views.includes(view));
export function replaceNode(tree, id, fn) {
  if (tree.id === id) return fn(tree);
  if (tree.t === 'split') return { ...tree, kids: tree.kids.map(k => replaceNode(k, id, fn)) };
  return tree;
}
export function findNode(tree, id) {
  if (tree.id === id) return tree;
  if (tree.t === 'split') for (const k of tree.kids) { const f = findNode(k, id); if (f) return f; }
  return null;
}

/** Move a view onto a tile: zone 'center' (as a tab, at index) or an edge ('left' 'right' 'top' 'bottom') to split. */
export function moveView(tree, view, target) {
  let t = clone(tree);
  const src = tileOf(t, view);
  const dst = findTile(t, target.tile);
  if (!dst) return tree;
  if (src && src.id === dst.id && target.zone !== 'center' && src.views.length === 1) return tree;
  if (src) {
    const at = src.views.indexOf(view);
    src.views.splice(at, 1);
    if (src.active === view) src.active = src.views[Math.max(0, at - 1)] ?? null;
  }
  if (target.zone === 'center') {
    const i = Math.min(target.index ?? dst.views.length, dst.views.length);
    dst.views.splice(i, 0, view);
    dst.active = view;
  } else {
    const fresh = { t: 'tile', id: newId('t'), views: [view], active: view };
    const dir = target.zone === 'left' || target.zone === 'right' ? 'row' : 'col';
    const before = target.zone === 'left' || target.zone === 'top';
    t = replaceNode(t, dst.id, d => ({ t: 'split', id: newId('s'), dir, kids: before ? [fresh, d] : [d, fresh], sizes: [0.5, 0.5] }));
  }
  return normalise(t);
}
