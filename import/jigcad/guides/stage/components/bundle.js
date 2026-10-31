/* @ds-bundle: {"format":4,"namespace":"FormSkateStage","components":[{"name":"Views"},{"name":"Loft"},{"name":"Figure"},{"name":"GroundAndShadow"},{"name":"Hatching"},{"name":"DepthOrder"},{"name":"Overlays"},{"name":"Trail"},{"name":"Chronophotograph"},{"name":"DimensionLine"},{"name":"Labels"},{"name":"SheetFurniture"},{"name":"Chip"},{"name":"TrickToast"},{"name":"FailBanner"},{"name":"StageHint"},{"name":"OverlayMenu"}]} */
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // build/kit/form-shim.js
  var require_form_shim = __commonJS({
    "build/kit/form-shim.js"(exports, module) {
      module.exports = globalThis.FORM;
    }
  });

  // build/kit/depth-order.js
  var require_depth_order = __commonJS({
    "build/kit/depth-order.js"(exports) {
      var { V: V4 } = require_form_shim();
      function byKey(items) {
        return items.slice().sort((a, b) => a.key - b.key);
      }
      function coherent(items, mem, band, key = (it) => it.key) {
        const byUid = new Map(items.map((it) => [it.uid, it]));
        const order = (mem.order || []).map((u) => byUid.get(u)).filter(Boolean);
        const seen = new Set(order);
        for (const it of items.slice().sort((a, b) => key(a) - key(b))) if (!seen.has(it)) order.push(it);
        if (!mem.order) order.sort((a, b) => key(a) - key(b));
        for (let i = 1; i < order.length; i++) {
          const x = order[i];
          let j = i - 1;
          while (j >= 0 && key(order[j]) > key(x) + band) {
            order[j + 1] = order[j];
            j--;
          }
          order[j + 1] = x;
        }
        mem.order = order.map((it) => it.uid);
        return order;
      }
      function planeVerdict(f, q, cam) {
        const { n, p0, tol = 4e-3, lean = 0 } = f.o.plane, nc = V4.dot(n, cam.c) + lean;
        if (nc === 0) return 0;
        let lo = Infinity, hi = -Infinity;
        if (q.k === "loft") for (const s of q.S) {
          const d = V4.dot(V4.sub(s.c, p0), n), e = Math.hypot(s.a * V4.dot(s.A, n), s.b * V4.dot(s.B, n));
          if (d - e < lo) lo = d - e;
          if (d + e > hi) hi = d + e;
        }
        else for (const p of q.pts) {
          const d = V4.dot(V4.sub(p, p0), n);
          if (d < lo) lo = d;
          if (d > hi) hi = d;
        }
        let side = 0;
        if (lo > -tol) side = 1;
        else if (hi < tol) side = -1;
        else {
          const above = hi / (hi - lo);
          side = above > 0.75 ? 1 : above < 0.25 ? -1 : 0;
        }
        return side * Math.sign(nc);
      }
      function anchored(items, cam, mem, kit, band = 0, keyOf = (it) => it.key) {
        const key = new Map(items.map((it) => [it, keyOf(it)]));
        const flats = items.filter((it) => it.o.plane);
        const front = /* @__PURE__ */ new Map(), under = /* @__PURE__ */ new Map();
        for (const f of flats) {
          const fr = [], un = [];
          for (const q of items) {
            if (q === f || q.o.plane || !kit.overlaps(f, q)) continue;
            const v = planeVerdict(f, q, cam);
            if (v > 0) fr.push(q);
            else if (v < 0 && q.o.under === f.name) un.push(q);
          }
          if (fr.length) key.set(f, Math.min(...fr.map((q) => key.get(q))) - 1e-3);
          else if (un.length) key.set(f, Math.max(...un.map((q) => key.get(q))) + 1e-3);
          for (const q of un) if (key.get(q) >= key.get(f)) key.set(q, key.get(f) - 1e-3 - 1e-4 * (key.get(q) - key.get(f)));
          front.set(f, new Set(fr));
          under.set(f, new Set(un));
        }
        if (!band) return items.slice().sort((a, b) => key.get(a) - key.get(b));
        const held = new Set(flats);
        for (const s of under.values()) for (const q of s) held.add(q);
        let order = coherent(items.filter((it) => !held.has(it)), mem, band, (it) => key.get(it));
        for (const f of flats) {
          const fr = front.get(f), at = order.findIndex((it) => fr.has(it)), k = key.get(f);
          const pos = at >= 0 ? at : ((i) => i < 0 ? order.length : i)(order.findIndex((it) => key.get(it) > k));
          const um = mem.under || (mem.under = {}), un = coherent([...under.get(f)], um, band, (it) => key.get(it));
          order = order.slice(0, pos).concat(un, [f], order.slice(pos));
        }
        return order;
      }
      function smoothKeys(items, mem, half = 0.03) {
        const a = 1 - Math.pow(0.5, 1 / 60 / half), prev = mem.keys || /* @__PURE__ */ new Map(), next = /* @__PURE__ */ new Map();
        for (const it of items) {
          const p = prev.get(it.uid);
          next.set(it.uid, p == null || Math.abs(p - it.key) > 0.1 ? it.key : p + a * (it.key - p));
        }
        mem.keys = next;
        return (it) => next.get(it.uid);
      }
      exports.strategies = {
        "centroid": (items) => byKey(items),
        "coherent": (items, cam, mem) => coherent(items, mem, 0.02),
        "deck plane": (items, cam, mem, kit) => anchored(items, cam, mem, kit, 0),
        "deck plane + coherent": (items, cam, mem, kit) => anchored(items, cam, mem, kit, 0.02),
        "deck plane + coherent + smoothed keys": (items, cam, mem, kit) => anchored(items, cam, mem, kit, 0.02, smoothKeys(items, mem))
      };
      exports.current = "deck plane";
      exports.describe = {
        "centroid": "one depth per part, its centroid plus a bias, sorted (the rule before the deck fix)",
        "coherent": "centroid keys, but last frame’s order is kept unless keys differ by more than 2 cm",
        "deck plane": "the deck ordered by its plane: whatever stands on it in front, its trucks and wheels behind (best with chain outlines)",
        "deck plane + coherent": "the deck plane, with everything else sorted coherently (best with chain outlines off)",
        "deck plane + coherent + smoothed keys": "as above, with every key low-pass filtered (30 ms half-life)"
      };
      exports.planeVerdict = planeVerdict;
      exports.coherent = coherent;
      exports.anchored = anchored;
      exports.byKey = byKey;
    }
  });

  // build/kit/board-draw.js
  var require_board_draw = __commonJS({
    "build/kit/board-draw.js"(exports, module) {
      var { V: V4, Q: Q3, clamp: clamp3 } = require_form_shim();
      var DECK = {
        length: 0.81,
        width: 0.21,
        thick: 0.012,
        wheelbase: 0.36,
        // axle to axle
        kick: 0.048,
        // how far the nose and tail rise above the flat
        kickStart: 0.25,
        // where the kicks begin, from the centre
        track: 0.17,
        // wheel centre to wheel centre across the truck
        wheelRadius: 0.027,
        axleDrop: 0.058,
        deckMass: 1.45,
        truckMass: 0.37
      };
      function kickY(x, d = DECK) {
        const u = Math.abs(x) - d.kickStart;
        if (u <= 0) return 0;
        const L = d.length / 2 - d.kickStart;
        return d.kick * Math.pow(Math.min(1, u / L), 1.6);
      }
      function kickSlope(x, d = DECK) {
        const u = Math.abs(x) - d.kickStart;
        if (u <= 0) return 0;
        const L = d.length / 2 - d.kickStart;
        return Math.sign(x) * d.kick * 1.6 * Math.pow(Math.min(1, u / L), 0.6) / L;
      }
      function halfWidth(x, d = DECK) {
        const r = d.width / 2, end = d.length / 2 - r, u = Math.abs(x) - end;
        return u <= 0 ? r : r * Math.sqrt(Math.max(0, 1 - (u / r) ** 2));
      }
      var gripAt = (x, d = DECK) => [x, kickY(x, d) + d.thick / 2, 0];
      function sectionsOfDeck(d) {
        const xs = [-0.405, -0.397, -0.385, -0.365, -0.335, -0.3, -0.25, -0.18, -0.06, 0.06, 0.18, 0.25, 0.3, 0.335, 0.365, 0.385, 0.397, 0.405].map((x) => x * d.length / 0.81);
        return xs.map((x) => {
          const sl = kickSlope(x, d), n = V4.norm([-sl, 1, 0]);
          return { c: [x, kickY(x, d), 0], A: [0, 0, 1], B: n, a: Math.max(4e-3, halfWidth(x, d)), b: d.thick / 2, ring: Math.abs(Math.abs(x) - d.kickStart) < 0.01 || Math.abs(Math.abs(x) - d.wheelbase / 2) < 0.01 ? 1 : 0 };
        });
      }
      function drawBoard2(g, pose, d, o = {}) {
        const rollQ = o.roll ? Q3.x(-o.roll) : null;
        const toW = (st, extraQ) => {
          const qd = pose.q;
          const tr = (v) => extraQ ? Q3.rot(extraQ, v) : v;
          return st.map((s) => ({ c: V4.add(pose.p, Q3.rot(qd, tr(s.c))), A: Q3.rot(qd, tr(s.A)), B: Q3.rot(qd, tr(s.B)), a: s.a, b: s.b, ring: s.ring }));
        };
        const ghost = o.ghost;
        const up = Q3.rot(pose.q, rollQ ? Q3.rot(rollQ, [0, 1, 0]) : [0, 1, 0]);
        g.loft(toW(sectionsOfDeck(d), rollQ), { bias: 0.02, ghost, meridian: false, name: "deck", plane: ghost ? null : { n: up, p0: pose.p, tol: d.thick, lean: 0.1 } });
        if (ghost) return;
        for (const sx of [-1, 1]) {
          const ax = sx * d.wheelbase / 2;
          g.loft(toW([0, 0.5, 1].map((t) => ({ c: [ax, -d.thick / 2 - t * 0.036, 0], A: [1, 0, 0], B: [0, 0, 1], a: lerp(0.028, 0.012, t), b: lerp(0.032, 0.012, t), ring: 0 }))), { bias: -0.01, name: "truck", under: "deck" });
          g.loft(toW([-1, -0.5, 0, 0.5, 1].map((t) => ({ c: [ax, -d.axleDrop + 6e-3 - Math.abs(t) * 4e-3, t * (d.track / 2 - 0.02)], A: [1, 0, 0], B: [0, 1, 0], a: 0.011 - Math.abs(t) * 2e-3, b: 0.012 - Math.abs(t) * 3e-3, ring: t === 0 ? 1 : 0 }))), { bias: -0.012, name: "hanger", under: "deck" });
          for (const sz of [-1, 1]) {
            const zc = sz * d.track / 2, r = d.wheelRadius;
            g.loft(toW([-0.017, -0.014, 0, 0.014, 0.017].map((z, i) => ({ c: [ax, -d.axleDrop, zc + z], A: [1, 0, 0], B: [0, 1, 0], a: i % 4 === 0 ? r * 0.8 : r, b: i % 4 === 0 ? r * 0.8 : r, ring: i === 2 ? 1 : 0 }))), { bias: -0.015, name: "wheel", under: "deck" });
          }
          for (const bx of [-0.027, 0.027]) for (const bz of [-0.02, 0.02]) {
            const p = V4.add(pose.p, Q3.rot(pose.q, [ax + bx, d.thick / 2 + 5e-4, bz]));
            g.dot(p, 0.9, { tone: "ink", normal: Q3.rot(pose.q, [0, 1, 0]) });
          }
        }
      }
      function lerp(a, b, t) {
        return a + (b - a) * t;
      }
      module.exports = { DECK, kickY, kickSlope, halfWidth, gripAt, sectionsOfDeck, drawBoard: drawBoard2 };
    }
  });

  // build/kit/figure-body.js
  var require_figure_body = __commonJS({
    "build/kit/figure-body.js"(exports, module) {
      var { V: V4, Q: Q3, clamp: clamp3, lerp, spring: spring2 } = require_form_shim();
      var HJOINTS = [
        ["hips", -1, [0, 1.02, 0]],
        ["spine", 0, [0, 0.1, -0.012]],
        ["spine1", 1, [0, 0.12, -6e-3]],
        ["chest", 2, [0, 0.13, 4e-3]],
        ["neck", 3, [0, 0.165, -0.022]],
        ["head", 4, [0, 0.105, 0.012]],
        ["clavL", 3, [0.024, 0.118, 0.028]],
        ["armL", 6, [0.158, 0.012, -0.046]],
        ["foreL", 7, [0, -0.31, 0]],
        ["handL", 8, [0, -0.26, 0]],
        ["clavR", 3, [-0.024, 0.118, 0.028]],
        ["armR", 10, [-0.158, 0.012, -0.046]],
        ["foreR", 11, [0, -0.31, 0]],
        ["handR", 12, [0, -0.26, 0]],
        ["thighL", 0, [0.09, -0.05, 2e-3]],
        ["shinL", 14, [0, -0.45, 0]],
        ["footL", 15, [0, -0.45, 0]],
        ["toeL", 16, [0, -0.052, 0.128]],
        ["thighR", 0, [-0.09, -0.05, 2e-3]],
        ["shinR", 18, [0, -0.45, 0]],
        ["footR", 19, [0, -0.45, 0]],
        ["toeR", 20, [0, -0.052, 0.128]]
      ];
      var HJ = HJOINTS.length;
      var J = {};
      HJOINTS.forEach((j, i) => J[j[0]] = i);
      var PAR = HJOINTS.map((j) => j[1]);
      var OFF = HJOINTS.map((j) => j[2]);
      var DEG2 = Math.PI / 180;
      var lim = (tw, a, b, pa, na, pb, nb, tmin, tmax) => ({ tw, a, b, pa: pa * DEG2, na: na * DEG2, pb: pb * DEG2, nb: nb * DEG2, tmin: tmin * DEG2, tmax: tmax * DEG2, p: 3 });
      var LIM = new Array(HJ).fill(null);
      LIM[J.thighL] = lim("y", "x", "z", 22, 128, 48, 28, -42, 42);
      LIM[J.thighR] = lim("y", "x", "z", 22, 128, 28, 48, -42, 42);
      var AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
      function limitJoint(j, q) {
        const L = LIM[j];
        if (!L) return q;
        const st = Q3.swingTwist(q, AX[L.tw]), v = Q3.log(st.swing);
        let va = V4.dot(v, AX[L.a]), vb = V4.dot(v, AX[L.b]);
        const f = Math.pow(Math.abs(va) / (va >= 0 ? L.pa : L.na), L.p) + Math.pow(Math.abs(vb) / (vb >= 0 ? L.pb : L.nb), L.p);
        let sw = st.swing;
        if (f > 1) {
          const k = Math.pow(f, -1 / L.p);
          va *= k;
          vb *= k;
          sw = Q3.exp(V4.add(V4.mul(AX[L.a], va), V4.mul(AX[L.b], vb)));
        }
        return Q3.norm(Q3.mul(sw, Q3.axis(AX[L.tw], clamp3(st.angle, L.tmin, L.tmax))));
      }
      var newPose = () => ({ q: Array.from({ length: HJ }, Q3.id), root: [0, OFF[0][1], 0] });
      function fk(pose) {
        const W = new Array(HJ), P = new Array(HJ);
        for (let j = 0; j < HJ; j++) {
          const p = PAR[j];
          if (p < 0) {
            W[j] = Q3.norm(pose.q[0]);
            P[j] = pose.root.slice();
          } else {
            W[j] = Q3.mul(W[p], pose.q[j]);
            P[j] = V4.add(P[p], Q3.rot(W[p], OFF[j]));
          }
        }
        return { W, P };
      }
      var toW = (F, j, v) => V4.add(F.P[j], Q3.rot(F.W[j], v));
      function legIK(pose, F, side, T, footWorld) {
        const u = side === "L" ? J.thighL : J.thighR, l = u + 1, e = u + 2;
        const A = F.P[u], a = V4.len(OFF[l]), b = V4.len(OFF[e]);
        const toT = V4.sub(T, A), dist = clamp3(V4.len(toT), 1e-3, a + b - 1e-4), uh = V4.norm(toT, [0, -1, 0]);
        const n1 = V4.norm(V4.perp(Q3.rot(F.W[u], [1, 0, 0]), uh), [1, 0, 0]), w = V4.cross(uh, n1);
        const ca = clamp3((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
        const d1 = V4.add(V4.mul(uh, ca), V4.mul(w, sa)), thighW = Q3.frame("-y", d1, "x", n1);
        const K = V4.add(A, V4.mul(d1, a)), theta = V4.angle(d1, V4.sub(V4.add(A, V4.mul(uh, dist)), K));
        pose.q[u] = limitJoint(u, Q3.mul(Q3.inv(F.W[PAR[u]]), thighW));
        pose.q[l] = Q3.x(theta);
        if (footWorld) pose.q[e] = Q3.mul(Q3.inv(Q3.mul(thighW, Q3.x(theta))), footWorld);
      }
      function armIK(F, side, T, pole) {
        const u = J["arm" + side], A = F.P[u], a = 0.31, b = 0.26;
        const toT = V4.sub(T, A), dist = clamp3(V4.len(toT), 0.1, a + b - 2e-3), uh = V4.norm(toT, [0, -1, 0]);
        let pp = V4.norm(V4.perp(pole, uh));
        if (V4.len(pp) < 0.5) pp = V4.norm(V4.perp([0, -1, 0], uh), [1, 0, 0]);
        const n1 = V4.norm(V4.cross(uh, pp), [1, 0, 0]), w = V4.cross(uh, n1);
        const ca = clamp3((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
        const d1 = V4.sub(V4.mul(uh, ca), V4.mul(w, sa)), upW = Q3.frame("-y", d1, "x", n1);
        const K = V4.add(A, V4.mul(d1, a)), theta = V4.angle(d1, V4.sub(V4.add(A, V4.mul(uh, dist)), K));
        return [Q3.mul(Q3.inv(F.W[PAR[u]]), upW), Q3.x(-theta)];
      }
      function capStations(j, o, r, dir) {
        const out = [];
        for (const t of [0.55, 0.85, 0.98]) {
          const c = o.slice();
          c[1] += dir * r * t;
          const rr = r * Math.sqrt(1 - t * t);
          out.push([j, c, rr, rr]);
        }
        return dir > 0 ? out.reverse() : out;
      }
      function limb(j, pts, capA, capB) {
        let st = pts.map(([y, a, b, ring]) => [j, [0, y, 0], a, b, ring ? 1 : 0]);
        if (capA) st = capStations(j, [0, pts[0][0], 0], capA, 1).concat(st);
        if (capB) st = st.concat(capStations(j, [0, pts[pts.length - 1][0], 0], capB, -1));
        return st;
      }
      function bodyParts() {
        const P = [];
        const chainOf = (key) => /^(thigh|shin|foot|toe)[LR]$/.test(key) ? "leg" + key.slice(-1) : /^(upperarm|forearm|hand)[LR]$/.test(key) ? "arm" + key.slice(-1) : key === "head" ? "head" : "torso";
        const add = (key, st, o = {}) => P.push({ key, st, ax: o.ax || "xz", bias: o.bias || 0, meridian: !!o.meridian, chain: chainOf(key) });
        const hc = [0, 0.086, 0.016], hr = [0.073, 0.112, 0.094], hs = [];
        for (const t of [-0.99, -0.93, -0.8, -0.6, -0.35, -0.08, 0.2, 0.46, 0.68, 0.85, 0.95, 0.995]) {
          const k = Math.sqrt(1 - t * t), jaw = t < 0 ? 1 + 0.18 * t : 1;
          hs.push([J.head, [hc[0], hc[1] + t * hr[1], hc[2] + (t < 0 ? -0.012 * t : 0)], hr[0] * k * jaw, hr[2] * k * (t < 0 ? 1 + 0.08 * t : 1)]);
        }
        add("head", hs, { bias: 0.06 });
        add("neck", [[J.neck, [0, -0.01, 0], 0.052, 0.046], [J.neck, [0, 0.05, 5e-3], 0.046, 0.043], [J.head, [0, 0, 0], 0.044, 0.042], [J.head, [0, 0.03, 0.01], 0.04, 0.04]], { bias: -0.02 });
        add("ribcage", [[J.spine1, [0, 0.03, 4e-3], 0.128, 0.092], [J.spine1, [0, 0.09, 8e-3], 0.14, 0.1, 1], [J.chest, [0, 0, 0.01], 0.15, 0.106], [J.chest, [0, 0.06, 0.012], 0.158, 0.106, 1], [J.chest, [0, 0.115, 4e-3], 0.162, 0.098], [J.chest, [0, 0.148, -0.01], 0.15, 0.084], [J.chest, [0, 0.168, -0.016], 0.11, 0.066], [J.neck, [0, 0.01, 0], 0.06, 0.05]], { meridian: true });
        add("abdomen", [[J.hips, [0, 0.03, 6e-3], 0.148, 0.098], [J.spine, [0, 0, 0.01], 0.136, 0.094, 1], [J.spine, [0, 0.06, 0.012], 0.128, 0.09], [J.spine1, [0, 0, 0.01], 0.128, 0.09], [J.spine1, [0, 0.05, 8e-3], 0.132, 0.094]], { meridian: true, bias: -0.01 });
        add("pelvis", [[J.hips, [0, -0.115, 4e-3], 0.1, 0.07], [J.hips, [0, -0.085, 6e-3], 0.152, 0.096], [J.hips, [0, -0.035, 8e-3], 0.168, 0.104, 1], [J.hips, [0, 0.02, 8e-3], 0.154, 0.1]], { meridian: true, bias: -0.02 });
        for (const s of ["L", "R"]) {
          const sg = s === "L" ? 1 : -1, arm = J["arm" + s], fore = J["fore" + s], hand = J["hand" + s], hx = (t) => -sg * 0.022 * t * t;
          add("upperarm" + s, limb(arm, [[0, 0.056, 0.058], [-0.05, 0.052, 0.056], [-0.15, 0.044, 0.047, 1], [-0.25, 0.037, 0.039], [-0.31, 0.034, 0.034]], 0.058, 0.034));
          add("forearm" + s, limb(fore, [[0, 0.035, 0.035], [-0.06, 0.037, 0.04], [-0.12, 0.034, 0.037, 1], [-0.21, 0.025, 0.029], [-0.255, 0.021, 0.026]], 0.035, 0.022));
          add("hand" + s, [[hand, [0, 0.01, 4e-3], 0.012, 0.024], [hand, [0, -0.01, 4e-3], 0.016, 0.033], [hand, [0, -0.05, 2e-3], 0.015, 0.043], [hand, [-sg * 2e-3, -0.09, 0], 0.013, 0.044], [hand, [hx(0.5), -0.12, -2e-3], 0.011, 0.04], [hand, [hx(0.8), -0.155, -4e-3], 9e-3, 0.035], [hand, [hx(1), -0.18, -6e-3], 7e-3, 0.028], [hand, [hx(1.05), -0.19, -6e-3], 4e-3, 0.016]]);
          const th = J["thigh" + s], sh = J["shin" + s], ft = J["foot" + s], to = J["toe" + s];
          add("thigh" + s, limb(th, [[0.02, 0.074, 0.08], [-0.08, 0.079, 0.083], [-0.2, 0.069, 0.073, 1], [-0.33, 0.057, 0.059], [-0.43, 0.05, 0.052], [-0.45, 0.049, 0.05]], 0.07, 0.048));
          add("shin" + s, limb(sh, [[0, 0.05, 0.05], [-0.08, 0.052, 0.058], [-0.16, 0.049, 0.055, 1], [-0.3, 0.036, 0.038], [-0.41, 0.03, 0.031], [-0.45, 0.029, 0.029]], 0.05, 0.03));
          add("foot" + s, [[ft, [0, -0.041, -0.088], 0.014, 0.014], [ft, [0, -0.04, -0.074], 0.03, 0.026], [ft, [0, -0.036, -0.045], 0.04, 0.034], [ft, [0, -0.03, -0.01], 0.043, 0.038, 1], [ft, [0, -0.046, 0.06], 0.049, 0.024], [ft, [0, -0.052, 0.118], 0.05, 0.018]], { ax: "xy", bias: 0.01 });
          add("toe" + s, [[to, [0, -2e-3, 0], 0.05, 0.017], [to, [0, -3e-3, 0.035], 0.046, 0.015], [to, [0, -4e-3, 0.058], 0.032, 0.011], [to, [0, -4e-3, 0.068], 0.014, 6e-3]], { ax: "xy", bias: 5e-3 });
        }
        return P;
      }
      var PARTS = bodyParts();
      var STICK = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [3, 6], [6, 7], [7, 8], [8, 9], [3, 10], [10, 11], [11, 12], [12, 13], [0, 14], [14, 15], [15, 16], [16, 17], [0, 18], [18, 19], [19, 20], [20, 21]];
      var CH = ["pp", "pr", "py", "sp", "st", "sl", "aLr", "aLf", "eL", "aRr", "aRf", "eR", "nk", "look"];
      var HALF = { pp: 0.1, pr: 0.1, py: 0.12, sp: 0.1, st: 0.12, sl: 0.1, aLr: 0.12, aLf: 0.12, eL: 0.1, aRr: 0.12, aRf: 0.12, eR: 0.1, nk: 0.12, look: 0.3 };
      function postureFor(s) {
        const S = s.stance, front = S > 0 ? "L" : "R", back = S > 0 ? "R" : "L";
        const P = { pp: 0.14 + 0.5 * s.crouch, pr: 0.06 * s.lean, py: 0.32 * S, sp: 0.08 + 0.35 * s.crouch, st: 0.22 * S, sl: -0.08 * s.lean, nk: 0.15, look: 1 };
        P["a" + front + "r"] = 0.62 + 0.25 * s.lean * S;
        P["a" + front + "f"] = 0.25;
        P["e" + front] = 0.55;
        P["a" + back + "r"] = 0.5 - 0.25 * s.lean * S;
        P["a" + back + "f"] = -0.05;
        P["e" + back] = 0.45;
        if (s.pushing) {
          P.py = 0.75 * S;
          P.st = 0.45 * S;
          P["a" + back + "f"] = 0.55;
          P["a" + back + "r"] = 0.2;
        }
        if (s.phase === "air") {
          P.pp = 0.32;
          P.sp = 0.22;
          P["a" + front + "r"] = 1.1;
          P["a" + back + "r"] = 0.95;
          P["a" + front + "f"] = 0.5;
          P["e" + front] = 0.8;
          P["e" + back] = 0.7;
          P.nk = 0.45;
        }
        if (s.phase === "bail") {
          P.pp = -0.3;
          P.sp = -0.2;
          P.aLr = 1.6;
          P.aRr = 1.5;
          P.aLf = 0.9;
          P.aRf = 0.6;
          P.eL = 0.3;
          P.eR = 0.5;
          P.nk = -0.2;
          P.look = 0;
        }
        return P;
      }
      function buildPose(w, rider, s, c) {
        const pose = newPose(), q = pose.q, S = s.stance;
        const p = w.position(rider.body), h = s.heading;
        pose.root = V4.add(p, [0, -0.05, 0]);
        q[0] = Q3.mul(Q3.y(h + c("py")), Q3.mul(Q3.x(c("pp")), Q3.z(c("pr"))));
        const sq = (f) => Q3.mul(Q3.y(c("st") * f), Q3.mul(Q3.x(c("sp") * f), Q3.z(c("sl") * f)));
        q[J.spine] = sq(0.3);
        q[J.spine1] = sq(0.35);
        q[J.chest] = sq(0.35);
        for (const [sd, sg] of [["L", 1], ["R", -1]]) {
          const r = c("a" + sd + "r"), f = c("a" + sd + "f");
          q[J["arm" + sd]] = Q3.mul(Q3.z(sg * r), Q3.x(-f));
          q[J["fore" + sd]] = Q3.x(-c("e" + sd));
          q[J["hand" + sd]] = Q3.mul(Q3.z(-sg * 0.1), Q3.x(0.1));
          q[J["clav" + sd]] = Q3.z(sg * Math.max(0, r - 0.5) * 0.3);
          q[J["thigh" + sd]] = Q3.mul(Q3.z(sg * 0.22), Q3.x(-0.35));
        }
        let F = fk(pose);
        const travel = V4.mul(V4.rotY(h, [1, 0, 0]), S);
        const look = s.phase === "air" ? w.position(rider.board.deck) : V4.add(V4.add(p, V4.mul(travel, 3)), [0, -1.1, 0]);
        const t = Q3.rot(Q3.inv(F.W[J.chest]), V4.sub(look, V4.add(F.P[J.neck], [0, 0.1, 0])));
        const yaw = clamp3(Math.atan2(t[0], t[2]), -1.35, 1.35) * c("look"), nod = clamp3(-Math.atan2(t[1], Math.hypot(t[0], t[2])), -0.6, 0.95) * c("look") + c("nk") * (1 - c("look"));
        q[J.neck] = Q3.mul(Q3.y(yaw * 0.45), Q3.x(nod * 0.45));
        q[J.head] = Q3.mul(Q3.y(yaw * 0.55), Q3.x(nod * 0.55));
        const legFor = S > 0 ? { L: rider.feet.front, R: rider.feet.rear } : { L: rider.feet.rear, R: rider.feet.front };
        const ft = {};
        for (const sd of ["L", "R"]) {
          const fp = w.pose(legFor[sd]);
          ft[sd] = { a: V4.sub(fp.p, Q3.rot(fp.q, [0, -0.0685, 0.033])), r: fp.q };
        }
        F = fk(pose);
        let drop = 0;
        for (const sd of ["L", "R"]) drop = Math.max(drop, V4.dist(F.P[J["thigh" + sd]], ft[sd].a) - 0.893);
        if (drop > 0) {
          pose.root[1] -= Math.min(drop, 0.25);
          F = fk(pose);
        }
        legIK(pose, F, "L", ft.L.a, ft.L.r);
        legIK(pose, F, "R", ft.R.a, ft.R.r);
        F = fk(pose);
        return F;
      }
      function drawFace(d, F, s) {
        const W = F.W[J.head], P0 = F.P[J.head];
        for (const sg of [1, -1]) d.decal({ p: P0, q: W }, [sg * 0.03, 0.1, 0.1], V4.norm([sg * 0.4, 0.1, 1]), 0.011, sg, (x) => {
          x.fillStyle = d.color("ink");
          x.strokeStyle = d.color("ink");
          x.lineCap = "round";
          x.beginPath();
          if (s.phase === "air") {
            x.lineWidth = 0.42;
            x.moveTo(-0.85, -0.3);
            x.quadraticCurveTo(0, 1.15, 0.85, -0.3);
            x.stroke();
          } else if (s.phase === "bail") {
            x.lineWidth = 0.35;
            x.moveTo(-0.7, -0.7);
            x.lineTo(0.7, 0.7);
            x.moveTo(0.7, -0.7);
            x.lineTo(-0.7, 0.7);
            x.stroke();
          } else {
            x.ellipse(0, 0, 0.72, 0.95, 0, 0, Math.PI * 2);
            x.fill();
            x.fillStyle = d.color("stage");
            x.beginPath();
            x.arc(0.24, 0.34, 0.26, 0, Math.PI * 2);
            x.fill();
          }
        });
        d.decal({ p: P0, q: W }, [0, 0.052, 0.103], [0, -0.15, 1], 0.02, 1, (x) => {
          const sm = s.phase === "bail" ? 0 : s.phase === "air" ? 1 : 0.55;
          x.strokeStyle = d.color("ink");
          x.lineWidth = 0.17;
          x.lineCap = "round";
          x.beginPath();
          x.moveTo(-0.9, 0.25);
          x.quadraticCurveTo(0, 0.2 - 0.4 - 1 * sm, 0.9, 0.25);
          x.stroke();
        });
      }
      module.exports = { HJOINTS, J, PARTS, STICK, CH, HALF, fk, toW, newPose, legIK, armIK, limitJoint, postureFor, buildPose, drawFace };
    }
  });

  // build/kit/form-math.js
  (function() {
    const TAU2 = Math.PI * 2, DEG2 = Math.PI / 180;
    const clamp3 = (x, a, b) => x < a ? a : x > b ? b : x;
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => {
      const t = clamp3((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const ease = (t) => {
      t = clamp3(t, 0, 1);
      return t * t * (3 - 2 * t);
    };
    const wrapPi = (a) => ((a + Math.PI) % TAU2 + TAU2) % TAU2 - Math.PI;
    const near = (v, target, tol) => Math.abs(v - target) <= tol;
    const V4 = {
      of: (x = 0, y = 0, z = 0) => [x, y, z],
      zero: () => [0, 0, 0],
      clone: (a) => [a[0], a[1], a[2]],
      add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
      sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
      mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
      madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
      neg: (a) => [-a[0], -a[1], -a[2]],
      dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
      cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
      len: (a) => Math.hypot(a[0], a[1], a[2]),
      norm: (a, fb) => {
        const l = Math.hypot(a[0], a[1], a[2]);
        return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fb ? fb.slice() : [0, 0, 0];
      },
      dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
      distXZ: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]),
      lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
      mid: (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      perp: (a, n) => {
        const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
        return [a[0] - n[0] * d, a[1] - n[1] * d, a[2] - n[2] * d];
      },
      clampLen: (a, max) => {
        const l = Math.hypot(a[0], a[1], a[2]);
        return l > max ? [a[0] * max / l, a[1] * max / l, a[2] * max / l] : a.slice();
      },
      rotY: (h, v) => {
        const c = Math.cos(h), s = Math.sin(h);
        return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
      },
      yaw: (v) => Math.atan2(v[0], v[2]),
      angle: (a, b) => Math.acos(clamp3(V4.dot(V4.norm(a), V4.norm(b)), -1, 1)),
      flat: (a) => [a[0], 0, a[2]]
    };
    const Q3 = {
      id: () => [0, 0, 0, 1],
      mul(a, b) {
        return [
          a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
          a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
          a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
          a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
        ];
      },
      inv: (q) => [-q[0], -q[1], -q[2], q[3]],
      dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3],
      neg: (q) => [-q[0], -q[1], -q[2], -q[3]],
      norm(q) {
        const l = Math.hypot(q[0], q[1], q[2], q[3]);
        return l > 1e-12 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : [0, 0, 0, 1];
      },
      axis(axis, ang) {
        const s = Math.sin(ang / 2), a = V4.norm(axis);
        return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)];
      },
      x: (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)],
      y: (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)],
      z: (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)],
      rot(q, v) {
        const x = q[0], y = q[1], z = q[2], w = q[3];
        const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
        return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
      },
      exp(v) {
        const a = V4.len(v);
        if (a < 1e-8) return Q3.norm([v[0] / 2, v[1] / 2, v[2] / 2, 1]);
        const s = Math.sin(a / 2) / a;
        return [v[0] * s, v[1] * s, v[2] * s, Math.cos(a / 2)];
      },
      log(q) {
        if (q[3] < 0) q = Q3.neg(q);
        const l = Math.hypot(q[0], q[1], q[2]);
        if (l < 1e-8) return [q[0] * 2, q[1] * 2, q[2] * 2];
        const a = 2 * Math.atan2(l, q[3]);
        return [q[0] / l * a, q[1] / l * a, q[2] / l * a];
      },
      slerp(a, b, t) {
        let d = Q3.dot(a, b);
        if (d < 0) {
          b = Q3.neg(b);
          d = -d;
        }
        if (d > 0.9995) return Q3.norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
        const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
        return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
      },
      fromBasis(x, y, z) {
        const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
        const tr = m00 + m11 + m22;
        let q;
        if (tr > 0) {
          const s = Math.sqrt(tr + 1) * 2;
          q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
        } else if (m00 > m11 && m00 > m22) {
          const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
          q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
        } else if (m11 > m22) {
          const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
          q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
        } else {
          const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
          q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
        }
        return Q3.norm(q);
      },
      // the rotation whose named axis follows p exactly and whose second named axis follows s as closely as possible
      frame(pn, p, sn, s) {
        const AX = { x: 0, y: 1, z: 2 };
        const P = V4.norm(p, [0, 1, 0]);
        let S = V4.norm(V4.perp(s, P));
        if (V4.len(S) < 1e-6) S = V4.norm(V4.perp(Math.abs(P[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], P));
        const cols = [null, null, null], pi = AX[pn.slice(-1)], si = AX[sn.slice(-1)];
        cols[pi] = V4.mul(P, pn[0] === "-" ? -1 : 1);
        cols[si] = V4.mul(S, sn[0] === "-" ? -1 : 1);
        const ti = 3 - pi - si;
        cols[ti] = ti === (si + 1) % 3 ? V4.cross(cols[pi], cols[si]) : V4.cross(cols[si], cols[pi]);
        return Q3.fromBasis(cols[0], cols[1], cols[2]);
      },
      swingTwist(q, a) {
        const p = V4.dot([q[0], q[1], q[2]], a);
        let tw = [a[0] * p, a[1] * p, a[2] * p, q[3]];
        const l = Math.hypot(tw[0], tw[1], tw[2], tw[3]);
        tw = l < 1e-9 ? [0, 0, 0, 1] : [tw[0] / l, tw[1] / l, tw[2] / l, tw[3] / l];
        const sw = Q3.mul(q, Q3.inv(tw)), ang = 2 * Math.atan2(V4.dot([tw[0], tw[1], tw[2]], a), tw[3]);
        return { swing: sw, twist: tw, angle: wrapPi(ang) };
      },
      yaw(q) {
        const f = Q3.rot(q, [0, 0, 1]);
        return Math.atan2(f[0], f[2]);
      },
      integrate(q, w, dt) {
        const h = 0.5 * dt, dq = [w[0] * h, w[1] * h, w[2] * h, 0];
        const r = Q3.mul(dq, q);
        return Q3.norm([q[0] + r[0], q[1] + r[1], q[2] + r[2], q[3] + r[3]]);
      },
      // the shortest rotation taking unit vector a onto unit vector b
      between(a, b) {
        const d = V4.dot(a, b);
        if (d < -0.999999) {
          let ax = V4.cross([1, 0, 0], a);
          if (V4.len(ax) < 1e-6) ax = V4.cross([0, 1, 0], a);
          return Q3.axis(ax, Math.PI);
        }
        const c = V4.cross(a, b);
        return Q3.norm([c[0], c[1], c[2], 1 + d]);
      }
    };
    const fastNegExp = (x) => 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const spring2 = {
      damping: (h) => 4 * 0.69314718056 / (h + 1e-5),
      step(s, g, h, dt) {
        const y = spring2.damping(h) / 2, e = fastNegExp(y * dt), j0 = s.x - g, j1 = s.v + j0 * y;
        s.x = e * (j0 + j1 * dt) + g;
        s.v = e * (s.v - j1 * y * dt);
        return s.x;
      },
      stepV(x, v, g, h, dt) {
        const y = spring2.damping(h) / 2, e = fastNegExp(y * dt);
        for (let i = 0; i < x.length; i++) {
          const j0 = x[i] - g[i], j1 = v[i] + j0 * y;
          x[i] = e * (j0 + j1 * dt) + g[i];
          v[i] = e * (v[i] - j1 * y * dt);
        }
      }
    };
    function mulberry32(a) {
      return function() {
        a |= 0;
        a = a + 1831565813 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const M = { TAU: TAU2, DEG: DEG2, clamp: clamp3, lerp, smooth, ease, wrapPi, near, V: V4, Q: Q3, spring: spring2 };
    globalThis.FORM = globalThis.FORM || M;
  })();

  // build/kit/draft.js
  var draft_exports = {};
  __export(draft_exports, {
    Draft: () => Draft,
    SUN: () => SUN,
    VIEWS: () => VIEWS,
    depth: () => depth,
    hull2: () => hull2,
    makeCam: () => makeCam,
    orderItems: () => orderItems,
    overlapKit: () => overlapKit,
    proj: () => proj,
    readColors: () => readColors,
    scaleBar: () => scaleBar,
    solidItems: () => solidItems,
    titleBlock: () => titleBlock,
    unprojectFloor: () => unprojectFloor
  });

  // build/kit/truth.js
  var truth_exports = {};
  __export(truth_exports, {
    chainRanks: () => chainRanks,
    misdrawn: () => misdrawn,
    oracleRank: () => oracleRank,
    rasterize: () => rasterize,
    topoRank: () => topoRank,
    truthOf: () => truthOf,
    unitOf: () => unitOf,
    unitOrder: () => unitOrder
  });
  var { V } = globalThis.FORM;
  function rasterize(items, cam, grid) {
    const { cellM, ox, oy, GW, GH } = grid, N = GW * GH, T = cam.T, c = cam.c, r = cam.r, u = cam.u;
    const step = cellM * 0.6, inv = 1 / cellM;
    const md = rasterize.md && rasterize.md.length >= N ? rasterize.md : rasterize.md = new Float32Array(N);
    const stamp = rasterize.stamp && rasterize.stamp.length >= N ? rasterize.stamp : rasterize.stamp = new Int32Array(N);
    const pix = [], mark = [], dep = [];
    for (let m = 0; m < items.length; m++) {
      const it = items[m], cur = rasterize.cur = (rasterize.cur || 0) + 1, list = [];
      const put = (x, y, z) => {
        const dx = x - T[0], dy = y - T[1], dz = z - T[2];
        const gx = ox + (dx * r[0] + dy * r[1] + dz * r[2]) * inv | 0, gy = oy - (dx * u[0] + dy * u[1] + dz * u[2]) * inv | 0;
        if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return;
        const k = gy * GW + gx, d = dx * c[0] + dy * c[1] + dz * c[2];
        if (stamp[k] !== cur) {
          stamp[k] = cur;
          md[k] = d;
          list.push(k);
        } else if (d > md[k]) md[k] = d;
      };
      if (it.k === "loft") {
        const S = it.S;
        for (let i = 0; i + 1 < S.length; i++) {
          const s0 = S[i], s1 = S[i + 1], L = Math.hypot(s1.c[0] - s0.c[0], s1.c[1] - s0.c[1], s1.c[2] - s0.c[2]), R = Math.max(s0.a, s0.b, s1.a, s1.b);
          const nt = Math.max(2, Math.ceil(L / step) + 1), nq = Math.max(12, Math.ceil(2 * Math.PI * R / step));
          for (let a = 0; a < nt; a++) {
            const t = a / (nt - 1), l = (p, q) => p + (q - p) * t;
            const cx = l(s0.c[0], s1.c[0]), cy = l(s0.c[1], s1.c[1]), cz = l(s0.c[2], s1.c[2]);
            const Ax = l(s0.A[0], s1.A[0]), Ay = l(s0.A[1], s1.A[1]), Az = l(s0.A[2], s1.A[2]), Bx = l(s0.B[0], s1.B[0]), By = l(s0.B[1], s1.B[1]), Bz = l(s0.B[2], s1.B[2]);
            const ra = l(s0.a, s1.a), rb = l(s0.b, s1.b);
            for (let q = 0; q < nq; q++) {
              const th = 2 * Math.PI * q / nq, ca = Math.cos(th) * ra, sb = Math.sin(th) * rb;
              put(cx + ca * Ax + sb * Bx, cy + ca * Ay + sb * By, cz + ca * Az + sb * Bz);
            }
          }
        }
        for (const s of [S[0], S[S.length - 1]]) {
          const R = Math.max(s.a, s.b), nr = Math.max(2, Math.ceil(R / step)), nq = Math.max(12, Math.ceil(2 * Math.PI * R / step));
          for (let a = 0; a <= nr; a++) {
            const rho = a / nr;
            for (let q = 0; q < nq; q++) {
              const th = 2 * Math.PI * q / nq, ca = Math.cos(th) * s.a * rho, sb = Math.sin(th) * s.b * rho;
              put(s.c[0] + ca * s.A[0] + sb * s.B[0], s.c[1] + ca * s.A[1] + sb * s.B[1], s.c[2] + ca * s.A[2] + sb * s.B[2]);
            }
          }
        }
      } else if (it.pts && it.pts.length >= 3) {
        const P = it.pts, n = V.norm(V.cross(V.sub(P[1], P[0]), V.sub(P[2], P[0]))), nc = V.dot(n, c);
        if (Math.abs(nc) < 1e-3) continue;
        const Qp = P.map((p) => {
          const d = V.sub(p, T);
          return [ox + V.dot(d, r) * inv, oy - V.dot(d, u) * inv];
        });
        const x0 = Math.max(0, Math.floor(Math.min(...Qp.map((q) => q[0])))), x1 = Math.min(GW - 1, Math.ceil(Math.max(...Qp.map((q) => q[0]))));
        const y0 = Math.max(0, Math.floor(Math.min(...Qp.map((q) => q[1])))), y1 = Math.min(GH - 1, Math.ceil(Math.max(...Qp.map((q) => q[1]))));
        const np0 = V.dot(n, V.sub(P[0], T)), nr = V.dot(n, r), nu = V.dot(n, u);
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
          const X = gx + 0.5, Y = gy + 0.5;
          let inside = false;
          for (let a = 0, b = Qp.length - 1; a < Qp.length; b = a++) if (Qp[a][1] > Y !== Qp[b][1] > Y && X < (Qp[b][0] - Qp[a][0]) * (Y - Qp[a][1]) / (Qp[b][1] - Qp[a][1]) + Qp[a][0]) inside = !inside;
          if (!inside) continue;
          const wa = (X - ox) * cellM, wb = (oy - Y) * cellM, t = (np0 - wa * nr - wb * nu) / nc;
          const k = gy * GW + gx;
          if (stamp[k] !== cur) {
            stamp[k] = cur;
            md[k] = t;
            list.push(k);
          } else if (t > md[k]) md[k] = t;
        }
      }
      for (const k of list) {
        pix.push(k);
        mark.push(m);
        dep.push(md[k]);
      }
    }
    return { pix, mark, dep, grid };
  }
  function truthOf(cov, n) {
    const N = cov.grid.GW * cov.grid.GH;
    const head = truthOf.head && truthOf.head.length >= N ? truthOf.head : truthOf.head = new Int32Array(N).fill(-1);
    const E = cov.pix.length, next = new Int32Array(E), touched = [];
    for (let e = 0; e < E; e++) {
      const k = cov.pix[e];
      if (head[k] === -1) touched.push(k);
      next[e] = head[k];
      head[k] = e;
    }
    const contested = [], pairs = /* @__PURE__ */ new Map();
    for (const k of touched) {
      let cnt = 0, best = -1, bd = -Infinity;
      const ents = [];
      for (let e = head[k]; e !== -1; e = next[e]) {
        cnt++;
        ents.push(e);
        if (cov.dep[e] > bd) {
          bd = cov.dep[e];
          best = cov.mark[e];
        }
      }
      head[k] = -1;
      if (cnt < 2) continue;
      contested.push({ cell: k, marks: ents.map((e) => cov.mark[e]), truth: best });
      for (let a = 0; a < ents.length; a++) for (let b = a + 1; b < ents.length; b++) {
        let i = cov.mark[ents[a]], j = cov.mark[ents[b]], di = cov.dep[ents[a]], dj = cov.dep[ents[b]];
        if (i === j) continue;
        if (i > j) {
          [i, j] = [j, i];
          [di, dj] = [dj, di];
        }
        const key = i * n + j;
        let s = pairs.get(key);
        if (!s) pairs.set(key, s = [0, 0]);
        if (di >= dj) s[0]++;
        else s[1]++;
      }
    }
    return { contested, pairs, covered: touched.length };
  }
  function misdrawn(truth, rank, sameUnit) {
    const out = [];
    for (const px of truth.contested) {
      let pid = -1, pr = -1;
      for (const m of px.marks) if (rank[m] > pr) {
        pr = rank[m];
        pid = m;
      }
      if (pid !== px.truth && !(sameUnit && sameUnit(pid, px.truth))) out.push({ cell: px.cell, truth: px.truth, drawn: pid });
    }
    return out;
  }
  function oracleRank(items, truth) {
    const n = items.length, edges = [];
    for (const [key, s] of truth.pairs) {
      const i = Math.floor(key / n), j = key % n, w = Math.abs(s[1] - s[0]);
      if (s[1] > s[0]) edges.push([i, j, w]);
      else edges.push([j, i, w]);
    }
    return topoRank(n, edges, items.map((it) => it.key));
  }
  function topoRank(n, edges, keys) {
    let E = edges.slice();
    const order = [], done = new Array(n).fill(false);
    while (order.length < n) {
      const indeg = new Array(n).fill(0);
      for (const [a, b] of E) if (!done[a] && !done[b]) indeg[b]++;
      let pick = -1;
      for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || keys[i] < keys[pick])) pick = i;
      if (pick < 0) {
        let w = Infinity, wi = -1;
        E.forEach(([a, b, wt], k) => {
          if (!done[a] && !done[b] && wt < w) {
            w = wt;
            wi = k;
          }
        });
        E.splice(wi, 1);
        continue;
      }
      done[pick] = true;
      order.push(pick);
    }
    const rank = new Array(n);
    order.forEach((i, r) => rank[i] = r);
    return rank;
  }
  var unitOf = (it) => it.k === "loft" && it.o.chain ? "c:" + it.o.chain : "u:" + it.uid;
  function unitOrder(items, rank, mem, band = 3) {
    const units = /* @__PURE__ */ new Map();
    items.forEach((it, i) => {
      const k = unitOf(it);
      let u = units.get(k);
      if (!u) units.set(k, u = { key: k, items: [], pos: 0 });
      u.items.push(it);
      u.pos += rank[i];
    });
    for (const u of units.values()) u.pos /= u.items.length;
    const order = (mem && mem.units || []).map((k) => units.get(k)).filter(Boolean), seen = new Set(order);
    const fresh = [...units.values()].filter((u) => !seen.has(u)).sort((a, b) => a.pos - b.pos);
    for (const u of fresh) {
      let j = order.length;
      while (j > 0 && order[j - 1].pos > u.pos) j--;
      order.splice(j, 0, u);
    }
    for (let i = 1; i < order.length; i++) {
      const x = order[i];
      let j = i - 1;
      while (j >= 0 && order[j].pos > x.pos + band) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = x;
    }
    if (mem) mem.units = order.map((u) => u.key);
    return order;
  }
  function chainRanks(items, rank, mem, band) {
    const order = unitOrder(items, rank, mem, band), at = /* @__PURE__ */ new Map();
    order.forEach((u, r) => at.set(u.key, r));
    return items.map((it) => at.get(unitOf(it)));
  }

  // build/kit/draft.js
  var { V: V2, Q, clamp } = globalThis.FORM;
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var VIEWS = {
    axo: { name: "Axonometric", short: "Axo", yaw: 38 * DEG, pitch: 27 * DEG },
    front: { name: "Front elevation", short: "Front", yaw: 0, pitch: 0 },
    side: { name: "Side elevation", short: "Side", yaw: -90 * DEG, pitch: 0 },
    plan: { name: "Plan", short: "Plan", yaw: 0, pitch: 90 * DEG }
  };
  function makeCam(yaw, pitch, scale, target, W, H) {
    const cp = Math.cos(pitch), c = [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
    const r = [Math.cos(yaw), 0, -Math.sin(yaw)], u = V2.cross(c, r);
    return { c, r, u, s: scale, T: target, W, H, yaw, pitch, Y0: H * (pitch > 1.2 ? 0.5 : 0.5) };
  }
  var proj = (cam, p) => {
    const d = V2.sub(p, cam.T);
    return [cam.W / 2 + V2.dot(d, cam.r) * cam.s, cam.Y0 - V2.dot(d, cam.u) * cam.s];
  };
  var depth = (cam, p) => V2.dot(V2.sub(p, cam.T), cam.c);
  function unprojectFloor(cam, x, y, h = 0) {
    const a = (x - cam.W / 2) / cam.s, b = (cam.Y0 - y) / cam.s;
    if (Math.abs(cam.c[1]) < 0.05) return null;
    const g = (h - cam.T[1] - a * cam.r[1] - b * cam.u[1]) / cam.c[1];
    return V2.add(cam.T, V2.add(V2.mul(cam.r, a), V2.add(V2.mul(cam.u, b), V2.mul(cam.c, g))));
  }
  function hull2(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
      lo.push(q);
    }
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
      up.push(q);
    }
    lo.pop();
    up.pop();
    return lo.concat(up);
  }
  var RING_K = 20;
  var COSK = [];
  var SINK = [];
  for (let k = 0; k < RING_K; k++) {
    COSK.push(Math.cos(TAU * k / RING_K));
    SINK.push(Math.sin(TAU * k / RING_K));
  }
  function ellipsePts(cam, s) {
    const out = new Array(RING_K), d = V2.sub(s.c, cam.T), cx = V2.dot(d, cam.r), cy = V2.dot(d, cam.u);
    const ar = V2.dot(s.A, cam.r) * s.a, au = V2.dot(s.A, cam.u) * s.a, br = V2.dot(s.B, cam.r) * s.b, bu = V2.dot(s.B, cam.u) * s.b, X0 = cam.W / 2, Y0 = cam.Y0;
    for (let k = 0; k < RING_K; k++) out[k] = [X0 + (cx + ar * COSK[k] + br * SINK[k]) * cam.s, Y0 - (cy + au * COSK[k] + bu * SINK[k]) * cam.s];
    return out;
  }
  function visibleArc(ctx, cam, s, pts) {
    let on = false;
    ctx.beginPath();
    for (let k = 0; k <= RING_K; k++) {
      const kk = k % RING_K, n = V2.add(V2.mul(s.A, s.b * COSK[kk]), V2.mul(s.B, s.a * SINK[kk])), vis = V2.dot(n, cam.c) > 0;
      if (vis) {
        on ? ctx.lineTo(pts[kk][0], pts[kk][1]) : ctx.moveTo(pts[kk][0], pts[kk][1]);
      }
      on = vis;
    }
    ctx.stroke();
  }
  function meridian(ctx, cam, S, dir) {
    ctx.beginPath();
    let on = false;
    for (const s of S) {
      const n = V2.add(V2.mul(s.A, dir[0]), V2.mul(s.B, dir[1])), p = V2.add(s.c, V2.add(V2.mul(s.A, s.a * dir[0]), V2.mul(s.B, s.b * dir[1])));
      const q = proj(cam, p), vis = V2.dot(n, cam.c) > 0.05;
      if (vis) {
        on ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      }
      on = vis;
    }
    ctx.stroke();
  }
  var TOKENS = ["st-bg", "st-grid", "st-major", "st-shadow", "st-ink", "st-muted", "st-rec", "st-warn", "st-soft", "st-blue", "st-green", "st-violet", "st-amber", "st-teal", "st-ghost"];
  function readColors(el) {
    const cs = getComputedStyle(el || document.documentElement), C = {};
    for (const k of TOKENS) C[k] = cs.getPropertyValue("--" + k).trim() || "#888";
    return {
      stage: C["st-bg"],
      grid: C["st-grid"],
      major: C["st-major"],
      shadow: C["st-shadow"],
      ink: C["st-ink"],
      muted: C["st-muted"],
      accent: C["st-rec"],
      red: C["st-rec"],
      warn: C["st-warn"],
      soft: C["st-soft"],
      blue: C["st-blue"],
      green: C["st-green"],
      violet: C["st-violet"],
      amber: C["st-amber"],
      teal: C["st-teal"],
      ghost: C["st-ghost"]
    };
  }
  var toneOf = (C, t, d) => !t ? d : C[t] || (/^(#|rgb|hsl)/.test(t) ? t : d);
  function hatchPattern(ctx, C, cache) {
    if (cache.p && cache.ctx === ctx && cache.col === C.shadow) return cache.p;
    const s = 6, c = document.createElement("canvas");
    c.width = c.height = s * 2;
    const x = c.getContext("2d");
    x.scale(2, 2);
    x.strokeStyle = C.shadow;
    x.lineWidth = 0.6;
    x.beginPath();
    x.moveTo(-1, s + 1);
    x.lineTo(s + 1, -1);
    x.moveTo(-1, 1);
    x.lineTo(1, -1);
    x.moveTo(s - 1, s + 1);
    x.lineTo(s + 1, s - 1);
    x.stroke();
    const p = ctx.createPattern(c, "repeat");
    if (p && p.setTransform) p.setTransform(new DOMMatrix().scale(0.5));
    Object.assign(cache, { p, ctx, col: C.shadow });
    return p;
  }
  function solidItems(marks, cam) {
    const counts = {}, out = [];
    for (const m of marks) {
      if (m.layer === "floor" || m.layer === "ghost" || m.o.ghost || m.k !== "loft" && m.k !== "poly") continue;
      const name = m.o.name || m.k, n = counts[name] = (counts[name] || 0) + 1;
      const pts = m.k === "loft" ? m.S.map((st) => st.c) : m.pts;
      let x = 0, y = 0, z = 0;
      for (const p of pts) {
        x += p[0];
        y += p[1];
        z += p[2];
      }
      const cen = [x / pts.length, y / pts.length, z / pts.length];
      out.push({ uid: name + "#" + n, name, k: m.k, S: m.S, pts: m.pts, o: m.o, cen, key: depth(cam, cen) + (m.o.bias || 0), m, i: out.length });
    }
    return out;
  }
  function convexOverlap(A, B) {
    for (const H of [A, B]) for (let i = 0; i < H.length; i++) {
      const p = H[i], q = H[(i + 1) % H.length], nx = q[1] - p[1], ny = p[0] - q[0];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) {
        const d = v[0] * nx + v[1] * ny;
        if (d < a0) a0 = d;
        if (d > a1) a1 = d;
      }
      for (const v of B) {
        const d = v[0] * nx + v[1] * ny;
        if (d < b0) b0 = d;
        if (d > b1) b1 = d;
      }
      if (a1 < b0 || b1 < a0) return false;
    }
    return true;
  }
  function overlapKit(cam) {
    const sx = (p) => {
      const d = V2.sub(p, cam.T);
      return [V2.dot(d, cam.r), V2.dot(d, cam.u)];
    };
    const box = (it) => it._bb || (it._bb = (() => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      if (it.k === "loft") for (const st of it.S) {
        const [x, y] = sx(st.c), ex = Math.hypot(st.a * V2.dot(st.A, cam.r), st.b * V2.dot(st.B, cam.r)), ey = Math.hypot(st.a * V2.dot(st.A, cam.u), st.b * V2.dot(st.B, cam.u));
        x0 = Math.min(x0, x - ex);
        x1 = Math.max(x1, x + ex);
        y0 = Math.min(y0, y - ey);
        y1 = Math.max(y1, y + ey);
      }
      else for (const p of it.pts) {
        const [x, y] = sx(p);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      return [x0, x1, y0, y1];
    })());
    const hulls = (it) => it._h || (it._h = it.k === "poly" ? [hull2(it.pts.map(sx))] : (() => {
      const E = it.S.map((st) => {
        const o = [];
        for (let k = 0; k < 8; k++) {
          const th = k * Math.PI / 4, ca = Math.cos(th) * st.a, sb = Math.sin(th) * st.b;
          o.push(sx([st.c[0] + ca * st.A[0] + sb * st.B[0], st.c[1] + ca * st.A[1] + sb * st.B[1], st.c[2] + ca * st.A[2] + sb * st.B[2]]));
        }
        return o;
      });
      const out = [];
      for (let i = 0; i + 1 < E.length; i++) out.push(hull2(E[i].concat(E[i + 1])));
      return out;
    })());
    return {
      overlaps(a, b) {
        const p = box(a), q = box(b);
        if (p[1] < q[0] || q[1] < p[0] || p[3] < q[2] || q[3] < p[2]) return false;
        const A = hulls(a), B = hulls(b);
        return A.some((h) => B.some((g) => convexOverlap(h, g)));
      },
      depth: (p) => depth(cam, p)
    };
  }
  var byKeySort = (items) => items.slice().sort((a, b) => a.key - b.key);
  function orderItems(items, cam, fn, mem, kit = overlapKit(cam)) {
    if (!fn) return { order: byKeySort(items), error: null };
    try {
      const out = fn(items.slice(), cam, mem, kit), all = new Set(items);
      if (Array.isArray(out) && out.length === items.length && new Set(out).size === items.length && out.every((x) => all.has(x))) return { order: out, error: null };
      return { order: byKeySort(items), error: new Error("the strategy did not return a reordering of its items") };
    } catch (e) {
      return { order: byKeySort(items), error: e };
    }
  }
  var SUN = V2.norm([-0.5, -1, -0.38]);
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  var Draft = class {
    constructor() {
      this.marks = [];
      this.layer = "figure";
      this.source = null;
      this.overlays = /* @__PURE__ */ new Set();
      this.span = null;
      this.heightAt = null;
      this._hatch = {};
      this.stats = { lofts: 0, marks: 0 };
      this.mem = {};
      this.prevRanks = null;
      this.flash = /* @__PURE__ */ new Map();
      this.truth = null;
    }
    begin(cam, C, o = {}) {
      this.cam = cam;
      this.C = C;
      this.marks = [];
      this.overlays = o.overlays || this.overlays;
      this.span = o.span || null;
      this.heightAt = o.heightAt || null;
      this.orderFn = o.order || null;
      this.chains = !!o.chains;
      if (o.orderName !== this.orderName) {
        this.orderName = o.orderName;
        this.mem = {};
        this.chainMem = {};
        this.prevRanks = null;
      }
      this.truthKey = o.truthKey == null ? null : o.truthKey;
      this.truthEvery = o.truthEvery == null ? 0.25 : o.truthEvery;
      this.now = o.now == null ? performance.now() / 1e3 : o.now;
    }
    on(name) {
      return this.overlays.has(name);
    }
    trailSpan() {
      return this.span;
    }
    _push(m) {
      m.layer = this.layer;
      m.source = this.source;
      this.marks.push(m);
    }
    loft(stations, o = {}) {
      if (stations && stations.length >= 2) this._push({ k: "loft", S: stations, o });
    }
    line(a, b, o = {}) {
      this._push({ k: "line", a, b, o });
    }
    polyline(pts, o = {}) {
      this._push({ k: "polyline", pts, o });
    }
    arrow(p, v, o = {}) {
      this._push({ k: "arrow", p, v, o });
    }
    dot(p, r = 2, o = {}) {
      this._push({ k: "dot", p, r, o });
    }
    ring(p, r = 0.1, o = {}) {
      this._push({ k: "ring", p, r, o });
    }
    label(text, p, o = {}) {
      this._push({ k: "label", text: String(text), p, o });
    }
    poly(pts, o = {}) {
      this._push({ k: "poly", pts, o });
    }
    grid(o = {}) {
      this._push({ k: "grid", o });
    }
    boundary(o = {}) {
      this._push({ k: "boundary", o });
    }
    dimension(a, b, text, o = {}) {
      this._push({ k: "dim", a, b, text, o });
    }
    path(pts, o = {}) {
      this.polyline(pts, o);
    }
    tone(name) {
      return toneOf(this.C, name, this.C.ink);
    }
    flush(ctx) {
      const cam = this.cam, C = this.C, M = this.marks, planar = cam.pitch > 0.05;
      this.stats = { lofts: M.filter((m) => m.k === "loft").length, marks: M.length };
      const floorMarks = M.filter((m) => m.layer === "floor" && (m.k === "grid" || m.k === "boundary" || m.k === "poly"));
      if (!planar) this.groundLine(ctx);
      for (const m of floorMarks) {
        if (m.k === "grid" && planar) {
          if (this.on("grid")) this.drawGrid(ctx, m.o);
        } else if (m.k === "boundary" && planar) this.drawBoundary(ctx, m.o);
        else if (m.k === "poly") this.drawPoly(ctx, m);
      }
      for (const m of M) if (m.layer === "floor" && !(m.k === "grid" || m.k === "boundary" || m.k === "poly")) this.drawOverlay(ctx, m);
      if (planar && this.on("shadows")) {
        const path = new Path2D();
        let any = false;
        for (const m of M) if (m.k === "loft" && m.layer !== "ghost" && !m.o.ghost && !m.o.noShadow) {
          this.shadowOf(path, m.S);
          any = true;
        }
        if (any) {
          ctx.fillStyle = hatchPattern(ctx, C, this._hatch) || C.major;
          ctx.fill(path);
        }
      }
      for (const m of M) if ((m.layer === "ghost" || m.o.ghost) && m.k === "loft") this.drawLoft(ctx, m.S, m.o, true);
      for (const m of M) if (m.layer === "ghost" && m.k !== "loft") this.drawOverlay(ctx, m);
      const items = solidItems(M, cam), kit = overlapKit(cam);
      const t0 = performance.now(), res = orderItems(items, cam, this.orderFn, this.mem, kit);
      this.orderMs = performance.now() - t0;
      this.orderError = res.error;
      this.items = items;
      this.order = res.order;
      if (this.chains) {
        const rank = new Array(items.length);
        res.order.forEach((it, r) => rank[it.i] = r);
        this.units = unitOrder(items, rank, this.chainMem || (this.chainMem = {}));
        this.drawChains(ctx, this.units);
      } else {
        this.units = null;
        for (const it of res.order) this.drawSolid(ctx, it.m);
      }
      this.trackChanges(res.order, kit);
      if (this.on("changes")) this.drawChanges(ctx, items);
      if (this.on("truth")) this.drawTruth(ctx, items, res.order);
      for (const m of M) if (m.layer !== "floor" && m.layer !== "ghost" && m.k !== "loft" && m.k !== "poly") this.drawOverlay(ctx, m);
    }
    // ---- floor
    groundLine(ctx) {
      const cam = this.cam, C = this.C, y = proj(cam, [cam.T[0], 0, cam.T[2]])[1];
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, cam.W, Math.min(18, cam.H - y));
      ctx.clip();
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let x = -20; x < cam.W + 20; x += 7) {
        ctx.moveTo(x, y + 18);
        ctx.lineTo(x + 18, y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cam.W, y);
      ctx.stroke();
    }
    visibleRange(extent) {
      const cam = this.cam, pts = [[0, 0], [cam.W, 0], [0, cam.H], [cam.W, cam.H], [cam.W / 2, cam.H / 2]].map(([x, y]) => unprojectFloor(cam, x, y)).filter(Boolean);
      if (pts.length < 4) return [-extent, extent, -extent, extent];
      const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]);
      return [Math.max(-extent, Math.min(...xs) - 1), Math.min(extent, Math.max(...xs) + 1), Math.max(-extent, Math.min(...zs) - 1), Math.min(extent, Math.max(...zs) + 1)];
    }
    drawGrid(ctx, o) {
      const cam = this.cam, C = this.C, minor = o.minor || 0.5, major = o.major || 2, A = o.extent || 10;
      const [x0, x1, z0, z1] = this.visibleRange(A);
      ctx.lineWidth = 0.6;
      const seg = (a, b, col) => {
        const p = proj(cam, a), q = proj(cam, b);
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      };
      for (let x = Math.ceil(x0 / minor) * minor; x <= x1; x += minor) seg([x, 0, Math.max(-A, z0)], [x, 0, Math.min(A, z1)], Math.abs(x / major - Math.round(x / major)) < 1e-6 ? C.major : C.grid);
      for (let z = Math.ceil(z0 / minor) * minor; z <= z1; z += minor) seg([Math.max(-A, x0), 0, z], [Math.min(A, x1), 0, z], Math.abs(z / major - Math.round(z / major)) < 1e-6 ? C.major : C.grid);
    }
    drawBoundary(ctx, o) {
      const cam = this.cam, C = this.C, A = o.size || 10, w = o.band || 0.3;
      const outer = [[-A - w, 0, -A - w], [A + w, 0, -A - w], [A + w, 0, A + w], [-A - w, 0, A + w]], inner = [[-A, 0, -A], [A, 0, -A], [A, 0, A], [-A, 0, A]];
      const P = (pts) => {
        const p = new Path2D();
        pts.forEach((v, i) => {
          const q = proj(cam, v);
          i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]);
        });
        p.closePath();
        return p;
      };
      const po = P(outer), pi = P(inner);
      ctx.save();
      ctx.fillStyle = hatchPattern(ctx, C, this._hatch) || C.major;
      const both = new Path2D();
      both.addPath(po);
      both.addPath(pi);
      ctx.fill(both, "evenodd");
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1;
      ctx.stroke(po);
      ctx.stroke(pi);
      ctx.restore();
    }
    shadowOf(path, S) {
      const hAt = this.heightAt, cam = this.cam;
      const sp = (p) => {
        const gy = hAt ? hAt(p[0], p[2]) : 0, k = Math.max(0, p[1] - gy) / -SUN[1];
        return proj(cam, [p[0] + SUN[0] * k, gy, p[2] + SUN[2] * k]);
      };
      const E = S.map((s) => {
        const o = [];
        for (let k = 0; k < RING_K; k += 2) o.push(sp(V2.add(s.c, V2.add(V2.mul(s.A, s.a * COSK[k]), V2.mul(s.B, s.b * SINK[k])))));
        return o;
      });
      for (let i = 0; i + 1 < E.length; i++) {
        const h = hull2(E[i].concat(E[i + 1]));
        path.moveTo(h[0][0], h[0][1]);
        for (let k = 1; k < h.length; k++) path.lineTo(h[k][0], h[k][1]);
        path.closePath();
      }
    }
    // ---- solids
    loftPath(S, path = new Path2D()) {
      const E = S.map((s) => ellipsePts(this.cam, s));
      for (let i = 0; i + 1 < E.length; i++) {
        const h = hull2(E[i].concat(E[i + 1]));
        path.moveTo(h[0][0], h[0][1]);
        for (let k = 1; k < h.length; k++) path.lineTo(h[k][0], h[k][1]);
        path.closePath();
      }
      return { path, E };
    }
    drawSolid(ctx, m) {
      if (m.k === "loft") {
        this.drawLoft(ctx, m.S, m.o, false);
        if (m.o.after) {
          try {
            m.o.after(this.decalCtx(ctx));
          } catch (e) {
          }
        }
      } else this.drawPoly(ctx, m);
    }
    // chains: the parts of a limb (o.chain) drawn as one outline, stroked and then filled together, so the seams at
    // its joints disappear. A chain sits in the order at the mean position of its parts.
    drawChains(ctx, list) {
      const C = this.C;
      for (const u of list) {
        if (u.items.length === 1) {
          this.drawSolid(ctx, u.items[0].m);
          continue;
        }
        const path = new Path2D(), Es = u.items.map((it) => this.loftPath(it.m.S, path).E);
        ctx.lineJoin = "round";
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.stroke(path);
        ctx.fillStyle = C.stage;
        ctx.fill(path);
        ctx.lineWidth = 0.55;
        ctx.globalAlpha = 0.7;
        u.items.forEach((it, j) => {
          it.m.S.forEach((s, i) => {
            if (s.ring) visibleArc(ctx, this.cam, s, Es[j][i]);
          });
          if (it.m.o.meridian) meridian(ctx, this.cam, it.m.S, [0, 1]);
        });
        ctx.globalAlpha = 1;
        for (const it of u.items) if (it.m.o.after) {
          try {
            it.m.o.after(this.decalCtx(ctx));
          } catch (e) {
          }
        }
      }
    }
    // order changes: overlapping pairs whose drawing order flipped since the last frame; flagged parts flash
    trackChanges(order, kit) {
      const rank = new Map(order.map((it, r) => [it.uid, r])), prev = this.prevRanks, flips = [];
      if (prev) for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
        const a = order[i], b = order[j], pa = prev.get(a.uid), pb = prev.get(b.uid);
        if (pa == null || pb == null || pa < pb) continue;
        if (kit.overlaps(a, b)) flips.push([a.uid, b.uid]);
      }
      this.prevRanks = rank;
      this.flips = flips;
      for (const [k, v] of this.flash) {
        if (v <= 1) this.flash.delete(k);
        else this.flash.set(k, v - 1);
      }
      for (const [a, b] of flips) {
        this.flash.set(a, 18);
        this.flash.set(b, 18);
      }
    }
    drawChanges(ctx, items) {
      const C = this.C;
      for (const it of items) {
        const f = this.flash.get(it.uid);
        if (!f || it.k !== "loft") continue;
        const { path } = this.loftPath(it.S);
        ctx.save();
        ctx.globalAlpha = Math.min(1, f / 10);
        ctx.strokeStyle = C.red;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = "round";
        ctx.stroke(path);
        ctx.restore();
      }
    }
    // truth: rasterize every solid's surface into cells of a few pixels, find the nearest part per cell, and paint
    // the cells the current order gets wrong. Recomputed a few times a second while playing, every frame on request.
    drawTruth(ctx, items, order) {
      const cam = this.cam, cpx = 3, now = this.now;
      const stale = !this.truth || (this.truthKey != null ? this.truth.key !== this.truthKey : now - this.truth.at >= this.truthEvery || now < this.truth.at) || this.truth.chains !== this.chains;
      if (stale) {
        const grid = { cellM: cpx / cam.s, ox: cam.W / 2 / cpx, oy: cam.Y0 / cpx, GW: Math.ceil(cam.W / cpx), GH: Math.ceil(cam.H / cpx) };
        const t0 = performance.now(), tr = truthOf(rasterize(items, cam, grid), items.length);
        let rank = new Array(items.length);
        order.forEach((it, r) => rank[it.i] = r);
        const sameChain = this.chains ? (a, b) => items[a].o.chain && items[a].o.chain === items[b].o.chain : null;
        if (this.chains && this.units) {
          const at = /* @__PURE__ */ new Map();
          this.units.forEach((u, r) => at.set(u.key, r));
          rank = items.map((it) => at.get(unitOf(it)));
        }
        const bad = misdrawn(tr, rank, sameChain);
        const cm = cpx / cam.s * 100;
        this.truth = { at: now, key: this.truthKey, chains: this.chains, cells: bad.map((b) => b.cell), GW: grid.GW, cpx, wrong: bad.length, contested: tr.contested.length, ms: performance.now() - t0, wrongCm2: bad.length * cm * cm };
      }
      const T = this.truth;
      ctx.save();
      ctx.fillStyle = this.C.red;
      ctx.globalAlpha = 0.5;
      for (const k of T.cells) ctx.fillRect(k % T.GW * T.cpx, Math.floor(k / T.GW) * T.cpx, T.cpx, T.cpx);
      ctx.restore();
    }
    drawLoft(ctx, S, o, ghost) {
      const cam = this.cam, C = this.C, { path, E } = this.loftPath(S);
      ctx.lineJoin = "round";
      if (ghost) {
        const a = typeof o.ghost === "number" ? o.ghost : 0.5;
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.5 * a;
        ctx.strokeStyle = toneOf(C, o.tone, C.ghost);
        ctx.lineWidth = 0.8;
        ctx.stroke(path);
        ctx.globalAlpha *= 0.3;
        ctx.fillStyle = C.stage;
        ctx.fill(path);
        ctx.restore();
        return;
      }
      const tone = toneOf(C, o.tone, C.ink);
      ctx.strokeStyle = tone;
      ctx.lineWidth = 2;
      ctx.stroke(path);
      ctx.fillStyle = o.fill === "soft" ? C.soft : C.stage;
      ctx.fill(path);
      ctx.lineWidth = 0.55;
      ctx.globalAlpha = 0.7;
      S.forEach((s, i) => {
        if (s.ring) visibleArc(ctx, cam, s, E[i]);
      });
      if (o.meridian) meridian(ctx, cam, S, [0, 1]);
      ctx.globalAlpha = 1;
    }
    drawPoly(ctx, m) {
      const cam = this.cam, C = this.C, o = m.o;
      ctx.beginPath();
      m.pts.forEach((p, i) => {
        const q = proj(cam, p);
        i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      });
      ctx.closePath();
      if (o.fill === "hatch") {
        ctx.fillStyle = C.stage;
        ctx.fill();
        ctx.fillStyle = hatchPattern(ctx, C, this._hatch) || C.major;
        ctx.fill();
      } else if (o.fill === "stage" || o.fill === void 0) {
        ctx.fillStyle = C.stage;
        ctx.fill();
      } else if (o.fill === "soft") {
        ctx.fillStyle = C.soft;
        ctx.fill();
      } else if (o.fill && o.fill !== "none") {
        ctx.fillStyle = C[o.fill] || o.fill;
        ctx.fill();
      }
      if (o.stroke !== false) {
        ctx.strokeStyle = toneOf(C, o.tone, C.ink);
        ctx.lineWidth = o.width || 1;
        ctx.stroke();
      }
    }
    // ---- overlays
    drawOverlay(ctx, m) {
      const cam = this.cam, C = this.C, o = m.o || {}, col = toneOf(C, o.tone, C.ink);
      ctx.save();
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = o.width || 1;
      if (o.dash) ctx.setLineDash(o.dash);
      if (m.k === "line") {
        const a = proj(cam, m.a), b = proj(cam, m.b);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      } else if (m.k === "polyline") {
        ctx.beginPath();
        m.pts.forEach((p, i) => {
          const q = proj(cam, p);
          i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        });
        if (o.closed) ctx.closePath();
        ctx.stroke();
      } else if (m.k === "arrow") {
        const a = proj(cam, m.p), b = proj(cam, V2.add(m.p, m.v)), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L > 0.5) {
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
          ctx.setLineDash([]);
          const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, h = Math.min(7, L * 0.5);
          ctx.beginPath();
          ctx.moveTo(b[0], b[1]);
          ctx.lineTo(b[0] - ux * h - uy * h * 0.45, b[1] - uy * h + ux * h * 0.45);
          ctx.lineTo(b[0] - ux * h + uy * h * 0.45, b[1] - uy * h - ux * h * 0.45);
          ctx.closePath();
          ctx.fill();
        }
      } else if (m.k === "dot") {
        if (o.normal && V2.dot(o.normal, cam.c) < 0.02) {
          ctx.restore();
          return;
        }
        const p = proj(cam, m.p);
        ctx.beginPath();
        ctx.arc(p[0], p[1], m.r, 0, TAU);
        if (o.hollow) {
          ctx.fillStyle = C.stage;
          ctx.fill();
          ctx.stroke();
        } else ctx.fill();
      } else if (m.k === "ring") {
        const pts = [];
        for (let k = 0; k <= 24; k++) {
          const a = TAU * k / 24;
          pts.push(proj(cam, V2.add(m.p, [Math.cos(a) * m.r, 0, Math.sin(a) * m.r])));
        }
        const span = Math.hypot(pts[0][0] - pts[12][0], pts[0][1] - pts[12][1]);
        ctx.beginPath();
        if (span < 6) {
          const p = proj(cam, m.p);
          ctx.arc(p[0], p[1], 3, 0, TAU);
        } else pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
        ctx.stroke();
      } else if (m.k === "label") {
        const p = proj(cam, m.p);
        this.text(ctx, m.text, p[0] + (o.dx || 0), p[1] + (o.dy || 0), { size: o.size || 9.5, col, align: o.align, bg: o.bg ? C.stage : null, w: o.weight });
      } else if (m.k === "dim") this.drawDimension(ctx, m, col);
      ctx.restore();
    }
    drawDimension(ctx, m, col) {
      const cam = this.cam, C = this.C, o = m.o || {}, off = o.offset ?? 0.4;
      const a = m.a, b = m.b, d = V2.sub(b, a), L = Math.hypot(d[0], d[2]);
      if (L < 0.05) return;
      const n = [-d[2] / L * off, 0, d[0] / L * off];
      const A = V2.add(a, n), B = V2.add(b, n), pa = proj(cam, a), pb = proj(cam, b), qa = proj(cam, A), qb = proj(cam, B);
      ctx.lineWidth = 0.7;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(qa[0] + (qa[0] - pa[0]) * 0.12, qa[1] + (qa[1] - pa[1]) * 0.12);
      ctx.moveTo(pb[0], pb[1]);
      ctx.lineTo(qb[0] + (qb[0] - pb[0]) * 0.12, qb[1] + (qb[1] - pb[1]) * 0.12);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(qa[0], qa[1]);
      ctx.lineTo(qb[0], qb[1]);
      ctx.stroke();
      for (const q of [qa, qb]) {
        ctx.beginPath();
        ctx.moveTo(q[0] - 4, q[1] + 4);
        ctx.lineTo(q[0] + 4, q[1] - 4);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      const mid = [(qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2];
      this.text(ctx, m.text, mid[0], mid[1], { size: 8.5, col, align: "center", bg: C.stage });
    }
    text(ctx, s, x, y, o = {}) {
      ctx.font = `${o.w || 500} ${o.size || 10}px ${o.mono === false ? "Arial, Helvetica, sans-serif" : MONO}`;
      ctx.textAlign = o.align || "left";
      ctx.textBaseline = o.base || "middle";
      if (o.bg) {
        const w = ctx.measureText(s).width, h = (o.size || 10) + 4, x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
        ctx.fillStyle = o.bg;
        ctx.fillRect(x0 - 3, y - h / 2, w + 6, h);
      }
      ctx.fillStyle = o.col || this.C.ink;
      ctx.fillText(s, x, y);
    }
    // features drawn in the tangent plane of a body (faces): an affine map, exact under an orthographic camera
    decalCtx(ctx) {
      const cam = this.cam, C = this.C;
      return {
        color: (name) => C[name] || C.ink,
        decal: (frame, local, n, r, mirror, fn) => {
          const W = frame.q, P0 = frame.p, E = V2.add(P0, Q.rot(W, local)), nw = Q.rot(W, V2.norm(n)), Y = Q.rot(W, [0, 1, 0]);
          if (V2.dot(nw, cam.c) < 0.02) return false;
          const e1 = V2.mul(V2.norm(V2.cross(Y, nw), Q.rot(W, [1, 0, 0])), mirror || 1), e2 = V2.cross(nw, V2.mul(e1, mirror || 1));
          const o = proj(cam, E), ax = proj(cam, V2.add(E, V2.mul(e1, r))), ay = proj(cam, V2.add(E, V2.mul(e2, r)));
          ctx.save();
          ctx.transform(ax[0] - o[0], ax[1] - o[1], ay[0] - o[0], ay[1] - o[1], o[0], o[1]);
          try {
            fn(ctx);
          } finally {
            ctx.restore();
          }
          return true;
        }
      };
    }
  };
  function titleBlock(ctx, d, cam, rows, sheet2 = "S-01") {
    if (cam.W < 640 || cam.H < 460) return;
    const C = d.C, w = 250, h = 17 + rows.length * 15, x = cam.W - w - 10, y = cam.H - h - 10;
    ctx.fillStyle = C.stage;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    d.text(ctx, "FORM SKATE", x + 8, y + 9, { size: 9.5, w: 700, mono: false });
    d.text(ctx, "SHEET " + sheet2, x + w - 8, y + 9, { size: 9, align: "right", col: C.muted });
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 17.5);
    ctx.lineTo(x + w, y + 17.5);
    ctx.stroke();
    rows.forEach(([k, v], i) => {
      d.text(ctx, k, x + 8, y + 25 + i * 15, { size: 9, col: C.muted });
      const s = String(v);
      d.text(ctx, s.length > 25 ? s.slice(0, 24) + "…" : s, x + 84, y + 25 + i * 15, { size: 9.5 });
    });
  }
  function scaleBar(ctx, d, cam) {
    const C = d.C, x = 14, y = cam.H - 18;
    let m = cam.s, label = "1 m";
    if (m > cam.W * 0.3) {
      m = cam.s * 0.25;
      label = "25 cm";
    } else if (m < 40) {
      m = cam.s * 5;
      label = "5 m";
    }
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + m, y);
    ctx.stroke();
    for (let k = 0; k <= 4; k++) {
      const X = x + m * k / 4;
      ctx.beginPath();
      ctx.moveTo(X, y - (k % 4 === 0 ? 5 : 3));
      ctx.lineTo(X, y);
      ctx.stroke();
    }
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y - 2, m / 4, 2);
    ctx.fillRect(x + m / 2, y - 2, m / 4, 2);
    d.text(ctx, "0", x, y - 11, { size: 9, align: "center" });
    d.text(ctx, label, x + m, y - 11, { size: 9, align: "center" });
  }

  // build/kit/stage-kit.js
  var import_depth_order = __toESM(require_depth_order());
  var import_board_draw = __toESM(require_board_draw());
  var import_figure_body = __toESM(require_figure_body());
  var { V: V3, Q: Q2, spring, clamp: clamp2 } = globalThis.FORM;
  var OVERLAYS = [
    ["shadows", "Shadows", "hatched sun shadows"],
    ["trail", "Trail", "onion skin of the last trick"],
    ["annotations", "Dims", "dimension lines from take-off to landing"],
    ["grid", "Grid", "the floor grid"],
    ["forces", "Forces", "leg force, foot guides"],
    ["contacts", "Contacts", "contact points and forces on the deck"],
    ["rig", "Rig", "the skeleton and centre of mass"],
    ["sites", "Sites", "named sites on the deck"],
    ["course", "Course", "the autopilot's waypoints"]
  ];
  var ORDER_TOGGLES = [
    ["changes", "Order changes", "outline in red the parts whose drawing order just flipped (flicker)"],
    ["truth", "Truth", "paint the pixels the drawing order gets wrong (a depth raster, a few times a second)"]
  ];
  var DEFAULT_OVERLAYS = ["shadows", "trail", "annotations", "grid"];
  var baseScale = (view, W, H) => view === "plan" ? Math.min(W, H) / 7.5 : Math.min(W / 5.5, H / 3.1);
  function sheet(canvas, o = {}) {
    const view = o.view || "axo", vw = VIEWS[view] || VIEWS.axo;
    const dpr = Math.min(2, window.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
    const W = Math.max(1, o.width || r.width), H = Math.max(1, o.height || r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const C = readColors(o.colorsFrom || canvas);
    const k = o.scale || baseScale(view, W, H) * (o.zoom || 1);
    const pitch = Math.max(-0.05, Math.min(Math.PI / 2, vw.pitch + (o.pitch || 0)));
    let cam = makeCam(vw.yaw + (o.yaw || 0), pitch, k, o.target || [0, view === "plan" ? 0 : 0.9, 0], W, H);
    if (o.pan) cam = makeCam(cam.yaw, cam.pitch, k, V3.add(cam.T, V3.add(V3.mul(cam.r, o.pan[0]), V3.mul(cam.u, o.pan[1]))), W, H);
    const ctx = canvas.getContext("2d"), g = new Draft();
    const orderName = o.order === void 0 ? import_depth_order.default.current : o.order, orderFn = orderName ? import_depth_order.default.strategies[orderName] : null;
    return {
      cam,
      C,
      ctx,
      g,
      W,
      H,
      view,
      draw(fn, f = {}) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = C.stage;
        ctx.fillRect(0, 0, W, H);
        g.begin(cam, C, { overlays: new Set(o.overlays || DEFAULT_OVERLAYS), span: o.span || null, heightAt: o.heightAt || null, order: orderFn, orderName, chains: o.chains !== false, truthKey: o.truthKey == null ? "still" : o.truthKey });
        fn(g, cam);
        g.flush(ctx);
        if (f.titleBlock) titleBlock(ctx, g, cam, f.titleBlock.rows, f.titleBlock.sheet);
        if (f.scaleBar) scaleBar(ctx, g, cam);
        return g;
      }
    };
  }
  function onTheme(fn) {
    const again = () => setTimeout(fn, 30);
    const mo = new MutationObserver(again);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq && mq.addEventListener) mq.addEventListener("change", again);
    return () => {
      mo.disconnect();
      if (mq && mq.removeEventListener) mq.removeEventListener("change", again);
    };
  }
  var deckPose = (p, q) => ({ p: p || [0, import_board_draw.default.DECK.wheelRadius + import_board_draw.default.DECK.axleDrop + 3e-3, 0], q: q || Q2.id() });
  function deckSites(pose, d = import_board_draw.default.DECK) {
    const L = d.length, local = { nose: [L / 2, import_board_draw.default.kickY(L / 2, d), 0], tail: [-L / 2, import_board_draw.default.kickY(L / 2, d), 0], grip: [0, d.thick / 2, 0], underside: [0, -d.thick / 2, 0], frontBolts: import_board_draw.default.gripAt(d.wheelbase / 2, d), rearBolts: import_board_draw.default.gripAt(-d.wheelbase / 2, d) };
    return Object.entries(local).map(([name, v]) => ({ name, p: V3.add(pose.p, Q2.rot(pose.q, v)) }));
  }
  function drawSites(g, pose, d) {
    for (const s of deckSites(pose, d)) {
      g.ring(s.p, 0.012, { tone: "green" });
      g.label(s.name, s.p, { tone: "green", dx: 6, dy: -6, size: 8 });
    }
  }
  function figurePose(o = {}) {
    const deck = o.deck || deckPose(), d = import_board_draw.default.DECK;
    const site = (x) => V3.add(deck.p, Q2.rot(deck.q, import_board_draw.default.gripAt(x, d)));
    const feet = { front: { p: site(o.stanceFront ?? 0.13), q: Q2.mul(deck.q, Q2.y(0.5)) }, rear: { p: site(-(o.stanceRear ?? 0.3)), q: Q2.mul(deck.q, Q2.y(0.15)) } };
    const mid = V3.mul(V3.add(feet.front.p, feet.rear.p), 0.5), hip = o.hip || V3.add(mid, [0, o.standHeight ?? 0.95, 0]);
    const where = { body: hip, deck: deck.p };
    const w = { position: (b) => where[b], pose: (b) => feet[b] };
    const rider = { stance: 1, body: "body", feet: { front: "front", rear: "rear" }, board: { deck: "deck" } };
    const s = { stance: 1, phase: o.phase || "ride", crouch: o.crouch || 0, lean: o.lean || 0, pushing: !!o.pushing, heading: o.heading || 0 };
    const T = import_figure_body.default.postureFor(s);
    return { F: import_figure_body.default.buildPose(w, rider, s, (k) => T[k] ?? 0), s, hip, feet };
  }
  function drawFigure(g, pose) {
    const { F, s, hip } = pose;
    for (const part of import_figure_body.default.PARTS) {
      const st = part.st.map(([j, o, a, b, ring]) => {
        const W = F.W[j];
        return { c: import_figure_body.default.toW(F, j, o), A: Q2.rot(W, [1, 0, 0]), B: Q2.rot(W, part.ax === "xy" ? [0, 1, 0] : [0, 0, 1]), a, b, ring: ring || 0 };
      });
      g.loft(st, { bias: part.bias, meridian: part.meridian, name: part.key, chain: part.chain, after: part.key === "head" ? (dd) => import_figure_body.default.drawFace(dd, F, s) : null });
    }
    if (g.on("rig")) {
      for (const [a, b] of import_figure_body.default.STICK) g.line(F.P[a], F.P[b], { tone: "violet", width: 1 });
      for (let j = 0; j < F.P.length; j++) g.dot(F.P[j], 2.2, { tone: "violet", hollow: true });
      if (hip) {
        g.dot(hip, 3.5, { tone: "accent" });
        g.label("COM", hip, { tone: "accent", dx: 7, dy: -7, size: 8 });
      }
    }
  }
  function drawTrail(g, samples, d = import_board_draw.default.DECK) {
    if (!g.on("trail") || !samples.length) return;
    let step = 5;
    while (samples.length > 18 * step) step *= 2;
    for (let i = 0; i < samples.length; i += step) import_board_draw.default.drawBoard(g, samples[i], d, { ghost: (i + 1) / samples.length });
    if (samples.length > 1) {
      g.polyline(samples.map((p) => p.p), { tone: "blue", width: 1.2, alpha: 0.85 });
      g.polyline(samples.map((p) => V3.add(p.p, Q2.rot(p.q, [d.length / 2, import_board_draw.default.kickY(d.length / 2, d), 0]))), { tone: "teal", width: 0.8, alpha: 0.6, dash: [3, 3] });
      const every = Math.max(1, Math.round(0.05 / (samples[1].t - samples[0].t || 0.05)));
      for (let i = 0; i < samples.length; i += every) g.dot(samples[i].p, 1.6, { tone: "blue" });
    }
  }
  function drawChrono(g, s, every = 0.08) {
    if (s.length < 2) return;
    const dt = s[1].t - s[0].t || 1 / 60, k = Math.max(1, Math.round(every / dt));
    for (let i = 0; i < s.length; i += k) {
      const { hip, ff, rf, deck: dk } = s[i], a = 0.25 + 0.75 * i / s.length, h = hip, head = V3.add(h, [0, 0.62, 0]);
      g.line(h, head, { tone: "violet", alpha: a });
      g.line(h, ff, { tone: "violet", alpha: a });
      g.line(h, rf, { tone: "violet", alpha: a });
      g.dot(head, 2.5, { tone: "violet", alpha: a, hollow: true });
      const nose = V3.add(dk.p, Q2.rot(dk.q, [0.4, 0, 0])), tail = V3.add(dk.p, Q2.rot(dk.q, [-0.4, 0, 0]));
      g.line(nose, tail, { tone: "blue", alpha: a, width: 1.6 });
    }
    g.polyline(s.map((x) => x.hip), { tone: "violet", dash: [2, 3], alpha: 0.6 });
  }
  var drawBoard = (g, pose, d, o) => import_board_draw.default.drawBoard(g, pose, d || import_board_draw.default.DECK, o || {});
  var api = { ...draft_exports, truth: truth_exports, depthOrder: import_depth_order.default, board: import_board_draw.default, figure: import_figure_body.default, V: V3, Q: Q2, spring, clamp: clamp2, OVERLAYS, ORDER_TOGGLES, DEFAULT_OVERLAYS, baseScale, sheet, onTheme, deckPose, deckSites, drawSites, figurePose, drawFigure, drawTrail, drawChrono, drawBoard };
  window.FormSkateStage = Object.assign(window.FormSkateStage || {}, api);
})();
