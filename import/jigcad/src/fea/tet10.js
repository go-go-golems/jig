// The 10-node tetrahedron as CalculiX numbers it (C3D10; ccx src/shape10tet.f, gauss.f):
//   corners 1–4 at natural (ξ, η, ζ) = (0,0,0), (1,0,0), (0,1,0), (0,0,1); mid-edge nodes
//   5 (1–2), 6 (2–3), 7 (3–1), 8 (1–4), 9 (2–4), 10 (3–4). Indices here are 0-based.
// Its 4-point rule (gauss3d5): point k sits nearest corner k, weights 1/24.
// Everything here is plain arithmetic: no kernel, no solver.

export const EDGES = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];   // mid-edge nodes 4..9
const A = 0.585410196624968, B = 0.138196601125011;
export const IP4 = [[B, B, B], [A, B, B], [B, A, B], [B, B, A]];       // natural (ξ, η, ζ), CalculiX's order
export const W4 = 1 / 24;

// shape functions and their natural derivatives at (ξ, η, ζ)
export function shape(xi, et, ze) {
  const a = 1 - xi - et - ze;
  const N = [(2 * a - 1) * a, xi * (2 * xi - 1), et * (2 * et - 1), ze * (2 * ze - 1), 4 * xi * a, 4 * xi * et, 4 * et * a, 4 * ze * a, 4 * xi * ze, 4 * et * ze];
  const dxi = [1 - 4 * a, 4 * xi - 1, 0, 0, 4 * (a - xi), 4 * et, -4 * et, -4 * ze, 4 * ze, 0];
  const det = [1 - 4 * a, 0, 4 * et - 1, 0, -4 * xi, 4 * xi, 4 * (a - et), -4 * ze, 0, 4 * ze];
  const dze = [1 - 4 * a, 0, 0, 4 * ze - 1, -4 * xi, 0, -4 * et, 4 * (a - ze), 4 * xi, 4 * et];
  return { N, dN: [dxi, det, dze] };
}

// barycentric coordinates (L1..L4) of a natural point
const bary = ([xi, et, ze]) => [1 - xi - et - ze, xi, et, ze];

// corner values of a field linear over the element, from its values at the four integration points:
// v_corner = C · v_ip, C the inverse of [L_i(ip_k)]
export const CORNER_FROM_IP = (() => {
  const M = IP4.map(bary);   // M[k][i] = L_i at point k; v_ip = M · v_corner
  return invert4(M);
})();
function invert4(M) {
  const n = 4, a = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c]; for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((r) => r.slice(n));
}

// a degree-3 rule on the reference tet (Keast): exact for the cubic integrands of a quadratic shape function times a
// linear body-force field. Barycentric points, weights summing to 1 (multiply by the element volume)
export const RULE3 = [
  { L: [0.25, 0.25, 0.25, 0.25], w: -0.8 },
  ...[[0.5, 1 / 6, 1 / 6, 1 / 6], [1 / 6, 0.5, 1 / 6, 1 / 6], [1 / 6, 1 / 6, 0.5, 1 / 6], [1 / 6, 1 / 6, 1 / 6, 0.5]].map((L) => ({ L, w: 0.45 })),
];
export const naturalOf = (L) => [L[1], L[2], L[3]];

// the Jacobian at a natural point for element coordinates X (10 × [x, y, z]): { J (3×3, rows = d/dξ), det, inv }
export function jacobian(X, dN) {
  const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r++) for (let n = 0; n < 10; n++) { const d = dN[r][n]; if (d) { J[r][0] += d * X[n][0]; J[r][1] += d * X[n][1]; J[r][2] += d * X[n][2]; } }
  const det = J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
  const inv = [
    [(J[1][1] * J[2][2] - J[1][2] * J[2][1]) / det, (J[0][2] * J[2][1] - J[0][1] * J[2][2]) / det, (J[0][1] * J[1][2] - J[0][2] * J[1][1]) / det],
    [(J[1][2] * J[2][0] - J[1][0] * J[2][2]) / det, (J[0][0] * J[2][2] - J[0][2] * J[2][0]) / det, (J[0][2] * J[1][0] - J[0][0] * J[1][2]) / det],
    [(J[1][0] * J[2][1] - J[1][1] * J[2][0]) / det, (J[0][1] * J[2][0] - J[0][0] * J[2][1]) / det, (J[0][0] * J[1][1] - J[0][1] * J[1][0]) / det],
  ];
  return { J, det, inv };
}

// global derivatives dN/dx (3 × 10) from natural ones and the inverse Jacobian
export function globalDerivatives(dN, inv) {
  const G = [new Array(10), new Array(10), new Array(10)];
  for (let n = 0; n < 10; n++) for (let i = 0; i < 3; i++) G[i][n] = inv[i][0] * dN[0][n] + inv[i][1] * dN[1][n] + inv[i][2] * dN[2][n];
  return G;
}

// von Mises of [sxx, syy, szz, sxy, sxz, syz]
export const vonMises = (s) => Math.sqrt(0.5 * ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) + 3 * (s[3] * s[3] + s[4] * s[4] + s[5] * s[5]));
