// Test-only stand-in for core's makeJCore() while src/engine/core.js does not exist yet.
import * as U from '../../src/engine/units.js';
import * as G from '../../src/engine/geom.js';
import * as E from '../../src/engine/expr.js';
import * as P from '../../src/engine/params.js';
import { pattern } from '../../src/engine/pattern.js';
let S = {};
try { S = await import('../../src/engine/sketch/index.js'); } catch {}
export function makeJCore() {
  const bare = Object.fromEntries(U.BARE_NAMES.map(k => [k, U.units[k]]));
  return {
    q: U.q, expr: E.expr, ref: n => n, units: U.units,
    pt: G.pt, vec: G.vec, dir: G.dir, origin: G.origin, tx: G.tx, plane: G.plane, axis: G.axis, frame: G.frame, point: G.point,
    pattern, sketch: S.sketch ?? (() => { throw new Error('sketch not available yet'); }), sketch3d: S.sketch3d, c: S.c, solver: S.solver,
    table: P.table, param: { expose: P.exposeMeta }, bare,
    DimensionError: U.DimensionError, AffineError: U.AffineError, ParamCycleError: P.ParamCycleError, ExprError: E.ExprError,
  };
}
export * from '../../src/engine/units.js';
