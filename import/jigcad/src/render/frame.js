// The frame change between jig and Candela, for the worker (src/engine/cadpkg.js, the CAD package) and the page
// (src/render/host.js, live poses): jig is millimetres with Z up and the front toward −Y; Candela is metres with Y up.
// p' = 0.001·(x, z, −y); a transform T becomes C·T·C⁻¹. Matrices are column-major, as jig and Candela keep them.
export const S = 0.001;
/** a direction (a normal, an axis) in Candela's frame */
export const R = (v) => [v[0], v[2], -v[1]];
/** a point in Candela's frame */
export const pt = (p) => R(p).map((x) => x * S);
const C = [S, 0, 0, 0, 0, 0, -S, 0, 0, S, 0, 0, 0, 0, 0, 1];
const Ci = [1 / S, 0, 0, 0, 0, 0, 1 / S, 0, 0, -1 / S, 0, 0, 0, 0, 0, 1];
function mul4(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
/** a jig transform (column-major, mm) in Candela's frame */
export const toCandelaMatrix = (T) => mul4(mul4(C, Array.from(T)), Ci).map(clean);
