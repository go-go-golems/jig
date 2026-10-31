// core.js · everything the kernel needs from the core modules, plus makeJCore() → the core part of `j`.
// See CORE-API.md for the reference.
export * from './units.js';
export * from './expr.js';
export * from './params.js';
export * from './geom.js';
export * from './pattern.js';
export * from './sketch/index.js';
export { buildProfiles } from './sketch/profiles.js';
export { System } from './sketch/system.js';
export { METHODS as SOLVER_METHODS } from './sketch/solver.js';

import * as U from './units.js';
import { expr, ref, Expr, ExprError } from './expr.js';
import { table, exposeMeta, ParamCycleError, Literal } from './params.js';
import { pt, vec, dir, origin, tx, plane, axis, frame, point, Point, Vec, Dir, Transform, Frame, Axis } from './geom.js';
import { pattern, Pattern } from './pattern.js';
import { sketch, sketch3d, c, solver, Sketch } from './sketch/index.js';

// The bare names of README §10 (put them in script scope).
export function bareNames() {
  const out = {};
  for (const k of U.BARE_NAMES) out[k] = U.units[k];
  return out;
}

export function makeJCore() {
  return {
    // units
    q: U.q, units: U.units, coerce: U.coerce, Quantity: U.Quantity, Toleranced: U.Toleranced,
    // expressions and parameters
    expr, ref, table, lit: v => new Literal(v),
    param: { expose: exposeMeta },
    // geometry
    pt, vec, dir, origin, tx, plane, axis, frame, point,
    // patterns, sketches, constraints, solver strategies
    pattern, sketch, sketch3d, c, solver,
    // sorts (for j.structure and instanceof checks) and errors
    Point, Vec, Dir, Transform, Frame, Axis, Pattern, Sketch, Expr,
    DimensionError: U.DimensionError, AffineError: U.AffineError, ParamCycleError, ExprError,
    bare: bareNames(),
  };
}
