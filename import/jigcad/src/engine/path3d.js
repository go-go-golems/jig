// 3D paths for sweeps: j.sketch3d(id).line(id, a, b).polyline(id, pts).spline(id, pts).helix(id, { axis, pitch, turns, r })
import { arr3 } from './adapt.js';

class Path3d {
  constructor(id, segs = []) { this.id = id; this.segs = segs; Object.freeze(this); }
  get isPath3d() { return true; }
  _add(s) { return new Path3d(this.id, [...this.segs, s]); }
  end() { const s = this.segs[this.segs.length - 1]; return s ? (s.b ?? s.pts?.[s.pts.length - 1]) : null; }
  line(id, a, b) { return this._add({ kind: 'line', id, a: a === undefined ? null : a, b: b ?? a }); }
  polyline(id, pts) { let p = this; for (let i = 0; i + 1 < pts.length; i++) p = p._add({ kind: 'line', id: `${id}.${i + 1}`, a: pts[i], b: pts[i + 1] }); return p; }
  spline(id, pts) { return this._add({ kind: 'spline', id, pts }); }
  arc(id, a, m, b) { return this._add({ kind: 'arc3', id, a, m, b }); }
  helix(id, { axis, pitch, turns, r, origin } = {}) { return this._add({ kind: 'helix', id, axis, pitch, turns, r, origin }); }
  toSegments(len = x => (typeof x === 'number' ? x : x.value)) {
    const P = p => arr3(Array.isArray(p) ? p.map(v => (typeof v === 'number' ? v : len(v))) : p);
    return this.segs.map(s => s.kind === 'line' ? { kind: 'line', a: P(s.a), b: P(s.b) }
      : s.kind === 'spline' ? { kind: 'spline', pts: s.pts.map(P) }
      : s.kind === 'arc3' ? { kind: 'arc3', a: P(s.a), m: P(s.m), b: P(s.b) }
      : { kind: 'helix', origin: s.origin ? P(s.origin) : [0, 0, 0], axis: s.axis ? (s.axis.dir ? arr3(s.axis.dir) : P(s.axis)) : [0, 0, 1], pitch: len(s.pitch), turns: s.turns, r: len(s.r) });
  }
  toString() { return `j.sketch3d('${this.id}') (${this.segs.length} segments)`; }
}
export const sketch3d = id => new Path3d(id);
