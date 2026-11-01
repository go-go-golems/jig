// Part builder (README §4.6): an immutable value holding a timeline of feature records.
// Nothing is computed here; compile.js / features.js evaluate the timeline.

// Where in script.js was this builder call made? (shared with core's sketch builder: src/engine/callsite.js)
import { callerLine } from './callsite.js';
export { callerLine };

const META0 = Object.freeze({ params: [], configs: null, config: null, overrides: [], exposed: null, material: null, color: null, colors: [], ports: [], fit: null, rules: [], sets: {}, presets: [] });

export class Part {
  constructor(name, items = [], meta = META0, flags = {}) {
    this.name = name; this.items = items; this.meta = meta;
    this.suppressed = flags.suppressed ?? []; this.rollbackTo = flags.rollbackTo ?? null;
    Object.freeze(this);
  }
  get kind() { return 'part'; }
  get isPart() { return true; }
  // one line for results and logs (JIG-012): the part and its features in order
  toString() {
    const f = this.items.map(x => `${x.id} (${x.type})`);
    return `part ${this.name}: ${f.length ? (f.length > 12 ? [...f.slice(0, 11), `… ${f.length - 11} more`] : f).join(' · ') : 'no features yet'}`;
  }
  _meta(patch) { return new Part(this.name, this.items, Object.freeze({ ...this.meta, ...patch }), this); }
  _add(type, args, opts = {}) {
    const auto = !opts?.id;
    const n = this.items.filter(f => f.type === type).length + 1;
    let id = opts?.id ?? `${type}${n}`;
    while (!opts?.id && this.items.some(f => f.id === id)) id = `${type}${n + Math.random().toString(36).slice(2, 4)}`;
    const rec = Object.freeze({ type, id, auto, args, opts: opts ?? {}, at: callerLine() });
    return new Part(this.name, [...this.items, rec], this.meta, this);
  }
  // ── parameters, configurations, appearance ──
  params(obj) { return this._meta({ params: [...this.meta.params, obj] }); }
  configs(c) { return this._meta({ configs: c }); }
  config(name) { return this._meta({ config: name }); }
  override(obj) { return this._meta({ overrides: [...this.meta.overrides, obj] }); }
  expose(names, opts = {}) { return this._meta({ exposed: { names, ...opts } }); }
  material(m) { return this._meta({ material: m }); }
  color(a, b) { return b === undefined ? this._meta({ color: a }) : this._meta({ colors: [...this.meta.colors, { sel: a, color: b }] }); }
  port(name, frame) { return this._meta({ ports: [...this.meta.ports, { name, frame }] }); }
  fit(profile) { return this._meta({ fit: profile }); }
  set(key, v) { return this._meta({ sets: { ...this.meta.sets, [key]: v } }); }
  use(...fns) {
    let p = this;
    for (const f of fns.flat()) {
      if (typeof f === 'function') p = f(p) ?? p;
      else if (f?.isRules) p = p._meta({ rules: [...p.meta.rules, f] });
      else if (f?.apply) p = f.apply(p) ?? p;
    }
    return p;
  }
  with(fn) { return fn(this) ?? this; }
  // ── features ──
  extrude(profile, extent, opts) { return this._add('extrude', [profile, extent], opts); }
  cut(profile, extent, opts = {}) { return this._add('extrude', [profile, extent], { ...opts, op: 'cut' }); }
  revolve(profile, axis, angle, opts) { return this._add('revolve', [profile, axis, angle], opts); }
  sweep(profile, path, opts) { return this._add('sweep', [profile, path], opts); }
  loft(profiles, opts) { return this._add('loft', [profiles], opts); }
  hole(at, spec, opts) { return this._add('hole', [at, spec], opts); }
  fillet(edges, r, opts) { return this._add('fillet', [edges, r], opts); }
  chamfer(edges, d, opts) { return this._add('chamfer', [edges, d], opts); }
  shell(open, t, opts) { return this._add('shell', [open, t], opts); }
  draft(faces, angle, opts) { return this._add('draft', [faces, angle], opts); }
  rib(wire, t, opts) { return this._add('rib', [wire, t], opts); }
  emboss(region, depth, opts) { return this._add('emboss', [region, depth], opts); }
  thicken(src, t, opts) { return this._add('thicken', [src, t], opts); }
  split(bodySel, tool, opts) { return this._add('split', [bodySel, tool], opts); }
  boolean(op, targets, tools, opts) { return this._add('boolean', [op, targets, tools], opts); }
  pattern(targets, pattern, opts) { return this._add('pattern', [targets, pattern], opts); }
  mirror(targets, plane, opts) { return this._add('mirror', [targets, plane], opts); }
  move(targets, tx, opts) { return this._add('move', [targets, tx], opts); }
  copy(targets, tx, opts) { return this._add('copy', [targets, tx], opts); }
  add(item, opts) { return this._add('add', [item], opts); }
  pushPull(faces, d, opts) { return this._add('pushPull', [faces, d], opts); }
  offsetFace(faces, d, opts) { return this._add('pushPull', [faces, d], opts); }
  deleteFace(faces, opts) { return this._add('deleteFace', [faces], opts); }
  import(src, opts) { return this._add('import', [src], opts); }
  feature(id, fn) { return this._add('custom', [fn], { id }); }
  // ── timeline edits ──
  suppress(id) { return new Part(this.name, this.items, this.meta, { ...this, suppressed: [...this.suppressed, id] }); }
  unsuppress(id) { return new Part(this.name, this.items, this.meta, { ...this, suppressed: this.suppressed.filter(x => x !== id) }); }
  rollback(id) { return new Part(this.name, this.items, this.meta, { ...this, rollbackTo: id }); }
  insertAfter(id, fn) {
    const i = this.items.findIndex(f => f.id === id);
    if (i < 0) throw new Error(`insertAfter: no feature '${id}'`);
    const head = new Part(this.name, this.items.slice(0, i + 1), this.meta, this);
    const grown = fn(head);
    const added = grown.items.slice(i + 1);
    return new Part(this.name, [...this.items.slice(0, i + 1), ...added, ...this.items.slice(i + 1)], grown.meta, this);
  }
  features() { return this.items.map(f => ({ id: f.id, type: f.type, suppressed: this.suppressed.includes(f.id) })); }
  // effective timeline: suppressed features removed, rollback applied
  timeline() {
    let items = this.items;
    if (this.rollbackTo) { const i = items.findIndex(f => f.id === this.rollbackTo); if (i >= 0) items = items.slice(0, i); }
    return items.filter(f => !this.suppressed.includes(f.id));
  }
}
export const part = name => new Part(name ?? 'part');
