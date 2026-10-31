// Regions (README §4.3b): planar 2D areas as profiles — rect, circle, polygon, slot; union/subtract by loops.
// A Region lowers to the kernel Profile form { frame, regions: [{ loops }] } on a plane (default XY).
import { frameOf, textValue } from './adapt.js';
import { textContours, nestContours } from './fonts.js';
import { loopAreaExact } from './shapes.js';
import { unionRegions, subtractRegions } from './region2d.js';

const XY = { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
export class Region {
  constructor(spec, plane = null) { this.spec = spec; this.plane = plane; Object.freeze(this); }
  get isRegion() { return true; }
  get hasAt() { return !!this.spec.opts?.at; }
  get kind() { return 'region'; }
  on(plane) { return new Region(this.spec, plane); }
  subtract(o) { return new Region({ op: 'subtract', a: this.spec, b: o.spec }, this.plane); }
  union(o) { return new Region({ op: 'union', a: this.spec, b: o.spec }, this.plane); }
  area(len = Number) { const p = this.toProfile(len); return p.regions.reduce((s, r) => s + r.loops.reduce((t, l, i) => t + (i ? -1 : 1) * Math.abs(loopAreaOf(l)), 0), 0); }
  toString() { return `j.region.${this.spec.op}(…)`; }
  toProfile(len = x => (typeof x === 'number' ? x : x.value)) {
    const frame = this.plane ? frameOf(this.plane) : XY;
    return { frame, regions: lower(this.spec, len) };
  }
}
function lower(s, len) {
  const L = x => len(x);
  switch (s.op) {
    case 'rect': {
      const w = L(s.w), h = L(s.h); const r = s.opts?.r ? L(s.opts.r) : 0;
      const at = (s.opts?.at ?? [0, 0]).map(L);
      const c = s.opts?.center === false ? [at[0] + w / 2, at[1] + h / 2] : at;
      return [{ loops: [rectLoop(c, w, h, r, s.id ?? 'rect')] }];
    }
    case 'circle': { const at = (s.opts?.at ?? [0, 0]).map(L); return [{ loops: [[{ kind: 'circle', c: at, r: L(s.r), src: s.id ?? 'circle' }]] }]; }
    case 'polygon': { const P = s.pts.map(p => p.map(L)); return [{ loops: [P.map((p, i) => ({ kind: 'line', a: p, b: P[(i + 1) % P.length], src: `polygon.${i + 1}` }))] }]; }
    case 'slot': {
      const a = s.a.map(L), b = s.b.map(L), r = L(s.width) / 2;
      const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...d), u = [d[0] / l, d[1] / l], n = [-u[1], u[0]];
      const ang = Math.atan2(u[1], u[0]);
      return [{ loops: [[
        { kind: 'line', a: [a[0] - n[0] * r, a[1] - n[1] * r], b: [b[0] - n[0] * r, b[1] - n[1] * r], src: 'slot.l1' },
        { kind: 'arc', c: b, r, a0: ang - Math.PI / 2, a1: ang + Math.PI / 2, ccw: true, src: 'slot.a2' },
        { kind: 'line', a: [b[0] + n[0] * r, b[1] + n[1] * r], b: [a[0] + n[0] * r, a[1] + n[1] * r], src: 'slot.l2' },
        { kind: 'arc', c: a, r, a0: ang + Math.PI / 2, a1: ang + 3 * Math.PI / 2, ccw: true, src: 'slot.a1' }]] }];
    }
    case 'text': {
      const o = s.opts ?? {};
      const { contours } = textContours(textValue(s.str, len.scope), { size: L(o.size ?? 5), font: o.font ?? 'sans', align: o.align ?? 'center', valign: o.valign ?? 'middle', at: (o.at ?? [0, 0]).map(L), spacing: o.spacing ? L(o.spacing) : 0 });
      if (!contours.length) throw new Error(`text '${textValue(s.str, len.scope)}' has no outline`);
      return nestContours(contours, s.id ?? 'text');
    }
    case 'loops': return s.regions;
    case 'custom': return s.lower(s, len);   // computed at compile time (gears: backlash from the fit context)
    case 'subtract': return subtractRegions(lower(s.a, len), lower(s.b, len));   // holes inside stay exact; crossings: a 2D boolean
    case 'union': return unionRegions(lower(s.a, len), lower(s.b, len));         // overlapping regions fuse into one
  }
  throw new Error(`region: unknown '${s.op}'`);
}
export function rectLoop(c, w, h, r = 0, id = 'rect') {
  const [cx, cy] = c, x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  if (!r) { const p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; return p.map((a, i) => ({ kind: 'line', a, b: p[(i + 1) % 4], src: `${id}.${['bottom', 'right', 'top', 'left'][i]}` })); }
  const P = Math.PI;
  return [
    { kind: 'line', a: [x0 + r, y0], b: [x1 - r, y0], src: `${id}.bottom` }, { kind: 'arc', c: [x1 - r, y0 + r], r, a0: -P / 2, a1: 0, ccw: true, src: `${id}.br` },
    { kind: 'line', a: [x1, y0 + r], b: [x1, y1 - r], src: `${id}.right` }, { kind: 'arc', c: [x1 - r, y1 - r], r, a0: 0, a1: P / 2, ccw: true, src: `${id}.tr` },
    { kind: 'line', a: [x1 - r, y1], b: [x0 + r, y1], src: `${id}.top` }, { kind: 'arc', c: [x0 + r, y1 - r], r, a0: P / 2, a1: P, ccw: true, src: `${id}.tl` },
    { kind: 'line', a: [x0, y1 - r], b: [x0, y0 + r], src: `${id}.left` }, { kind: 'arc', c: [x0 + r, y0 + r], r, a0: P, a1: 3 * P / 2, ccw: true, src: `${id}.bl` },
  ];
}
const loopAreaOf = loopAreaExact;   // lines, arcs, circles, ellipses exact; splines and Béziers as fine polylines
export const region = {
  rect: (w, h, opts) => new Region({ op: 'rect', w, h, opts }),
  circle: (r, opts) => new Region({ op: 'circle', r, opts }),
  polygon: pts => new Region({ op: 'polygon', pts }),
  slot: (a, b, width) => new Region({ op: 'slot', a, b, width }),
  text: (str, opts) => new Region({ op: 'text', str: typeof str === 'string' || typeof str === 'function' || str?.kind === 'expr' || str?.kind === 'literal' || str?.isRef ? str : String(str), opts }),
};
