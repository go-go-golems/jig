// Physical vectors as scripts give them (a force, a moment, an acceleration, gravity), read by one grammar so that
// a value means the same thing in a stress study (fea.js) and in a mechanism (assembly.js):
//
//   [x, y, z]            a vector, whose magnitude is kept. Each component is a number in the plain unit (N for a
//                        force, N·mm for a moment, g for an acceleration), a quantity of the vector's dimension
//                        (checked: a force is not an acceleration), a param name, or a quantity string
//   magnitude, { dir }   a magnitude along a direction. The direction ('-Z', j.dir(…), [x, y, z]) is a unit: its
//                        length is ignored
//   '-Z', j.dir(…)       where the measure has a unit (an acceleration: 1 g), one unit along a direction
//
// A direction is never read as a vector and a vector never loses its length: [0, 0, -2] is 2 g, '-Z' is 1 g, and a
// vector with a { dir } as well is an error rather than one of the two silently winning.
import { dir as toDir, Dir } from './geom.js';
import { isQuantity, q as parseQuantity } from './units.js';

export const G0 = 9806.65;   // standard gravity, mm/s²

// unit → what a plain number means in it, the words for errors, and (for accelerations) the size of a bare direction
const UNITS = {
  N: { plain: 1, name: 'a force (N)' },
  'N*mm': { plain: 1, name: 'a moment (N·mm)' },
  MPa: { plain: 1, name: 'a pressure (MPa)' },
  mm: { plain: 1, name: 'a length (mm)' },
  'mm/s^2': { plain: G0, name: 'an acceleration (a number in g, or a quantity such as 3 m/s^2)', unitDir: G0 },
};
const unitOf = (unit) => UNITS[unit] ?? { plain: 1, name: unit };

/** a unit direction [x, y, z] from '+X', '-Z', j.dir(…) or [x, y, z] (normalised) */
export function direction(d, what = 'direction') {
  if (d == null) throw new TypeError(`${what}: a direction is '+X', '-Z', … or [x, y, z], not ${d}`);
  let v;
  try { v = toDir(d).toArray(); } catch (e) { throw new TypeError(`${what}: ${e.message}`); }
  if (!v.every(Number.isFinite)) throw new TypeError(`${what}: a direction is '+X', '-Z', … or [x, y, z], not ${JSON.stringify(d)}`);
  return v;
}

/** a number in `unit` from a quantity (of that dimension), a param name, a quantity string, or a plain number */
export function scalarIn(v, unit, { values = null, what = unit } = {}) {
  const u = unitOf(unit);
  if (typeof v === 'string') {
    if (values && v in values) v = values[v];
    else { try { v = parseQuantity(v); } catch { throw new TypeError(`${what}: '${v}' is neither a param nor a quantity`); } }
  }
  if (isQuantity(v)) {
    if (v.isDimensionless) return v.value * u.plain;
    try { return v.in(unit); } catch { throw new TypeError(`${what} takes ${u.name}, got ${v}`); }
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v * u.plain;
  throw new TypeError(`${what}: expected ${u.name}, got ${v}`);
}

/** a vector [x, y, z] in `unit`, by the grammar above; o: { dir, values (params), what (for errors) } */
export function vectorIn(v, unit, { dir = null, values = null, what = unit } = {}) {
  const u = unitOf(unit);
  if (Array.isArray(v)) {
    if (v.length !== 3) throw new TypeError(`${what}: a vector has three components, not [${v}]`);
    if (dir != null) throw new TypeError(`${what}: the vector [${v}] carries its own direction; drop { dir }, or give a magnitude`);
    return v.map((x) => scalarIn(x, unit, { values, what }));
  }
  if (dir != null) {
    const d = direction(dir, what), s = scalarIn(v, unit, { values, what });
    return d.map((x) => x * s);
  }
  const bareDir = v instanceof Dir || (typeof v === 'string' && !(values && v in values));
  if (u.unitDir != null && bareDir) return direction(v, what).map((x) => x * u.unitDir);
  throw new TypeError(`${what}: give a vector [x, y, z] or a magnitude with { dir: '-Z' }`);
}

export const force = (v, o = {}) => vectorIn(v, 'N', { what: 'force', ...o });
export const moment = (v, o = {}) => vectorIn(v, 'N*mm', { what: 'moment', ...o });
export const acceleration = (v, o = {}) => vectorIn(v, 'mm/s^2', { what: 'acceleration', ...o });
