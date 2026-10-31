// stage-kit.js — the entry of window.FormSkateStage. Everything the stage draws with comes from the workbench's own
// files (see build-bundle.js); this file adds only the stage's call sequence and a few transcriptions, each one
// marked with the lines it copies, so a page outside the workbench can draw a sheet exactly as the stage does.
import './form-math.js';
import * as draft from './draft.js';
import * as truth from './truth.js';
import depthOrder from './depth-order.js';
import board from './board-draw.js';
import figure from './figure-body.js';
const { V, Q, spring, clamp } = globalThis.FORM;

// the stage's overlay switches and Order-menu tools (app/ui/stage.jsx:10-19), and its default set (app/host.js:34)
export const OVERLAYS = [
  ['shadows', 'Shadows', 'hatched sun shadows'], ['trail', 'Trail', 'onion skin of the last trick'], ['annotations', 'Dims', 'dimension lines from take-off to landing'],
  ['grid', 'Grid', 'the floor grid'], ['forces', 'Forces', 'leg force, foot guides'], ['contacts', 'Contacts', 'contact points and forces on the deck'],
  ['rig', 'Rig', 'the skeleton and centre of mass'], ['sites', 'Sites', 'named sites on the deck'], ['course', 'Course', "the autopilot's waypoints"],
];
export const ORDER_TOGGLES = [
  ['changes', 'Order changes', 'outline in red the parts whose drawing order just flipped (flicker)'],
  ['truth', 'Truth', 'paint the pixels the drawing order gets wrong (a depth raster, a few times a second)'],
];
export const DEFAULT_OVERLAYS = ['shadows', 'trail', 'annotations', 'grid'];

// pixels per metre at zoom 1 (app/ui/stage.jsx:94): the plan fits 7.5 m across the shorter side; the other views
// fit 5.5 m across or 3.1 m up, whichever is smaller
export const baseScale = (view, W, H) => view === 'plan' ? Math.min(W, H) / 7.5 : Math.min(W / 5.5, H / 3.1);

// sheet(canvas, options): size the canvas for the screen, read the stage colours from CSS, and build the camera the
// stage builds (app/ui/stage.jsx:60-118). draw(fn) clears to the sheet colour, lets fn add marks to the drafting
// context g, flushes them in layer order and adds the sheet furniture.
//   options: view ('axo' | 'front' | 'side' | 'plan'), zoom, scale (px/m, overrides zoom), yaw / pitch (orbit, rad),
//   target ([x, y, z] the sheet centres on; default [0, 0.9, 0], or [0, 0, 0] in plan), pan ([right, up] in metres),
//   overlays (names; default the stage's), order (a depth-order strategy name, null for keys), chains (default true),
//   span ([t0, t1] for g.trailSpan()), heightAt ((x, z) => ground height), width / height (CSS px), colorsFrom (element)
export function sheet(canvas, o = {}) {
  const view = o.view || 'axo', vw = draft.VIEWS[view] || draft.VIEWS.axo;
  const dpr = Math.min(2, window.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
  const W = Math.max(1, o.width || r.width), H = Math.max(1, o.height || r.height);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const C = draft.readColors(o.colorsFrom || canvas);
  const k = o.scale || baseScale(view, W, H) * (o.zoom || 1);
  const pitch = Math.max(-0.05, Math.min(Math.PI / 2, vw.pitch + (o.pitch || 0)));
  let cam = draft.makeCam(vw.yaw + (o.yaw || 0), pitch, k, o.target || [0, view === 'plan' ? 0 : 0.9, 0], W, H);
  if (o.pan) cam = draft.makeCam(cam.yaw, cam.pitch, k, V.add(cam.T, V.add(V.mul(cam.r, o.pan[0]), V.mul(cam.u, o.pan[1]))), W, H);
  const ctx = canvas.getContext('2d'), g = new draft.Draft();
  const orderName = o.order === undefined ? depthOrder.current : o.order, orderFn = orderName ? depthOrder.strategies[orderName] : null;
  return {
    cam, C, ctx, g, W, H, view,
    draw(fn, f = {}) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = C.stage; ctx.fillRect(0, 0, W, H);
      g.begin(cam, C, { overlays: new Set(o.overlays || DEFAULT_OVERLAYS), span: o.span || null, heightAt: o.heightAt || null, order: orderFn, orderName, chains: o.chains !== false, truthKey: o.truthKey == null ? 'still' : o.truthKey });
      fn(g, cam);
      g.flush(ctx);
      if (f.titleBlock) draft.titleBlock(ctx, g, cam, f.titleBlock.rows, f.titleBlock.sheet);
      if (f.scaleBar) draft.scaleBar(ctx, g, cam);
      return g;
    },
  };
}

// redraw when the theme changes (app/ui/stage.jsx:64-66: the stage re-reads its colours 30 ms after a change)
export function onTheme(fn) {
  const again = () => setTimeout(fn, 30);
  const mo = new MutationObserver(again); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)'); if (mq && mq.addEventListener) mq.addEventListener('change', again);
  return () => { mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', again); };
}

// the deck at rest on its wheels: the spawn height of src/lib/skate/board.js:53
export const deckPose = (p, q) => ({ p: p || [0, board.DECK.wheelRadius + board.DECK.axleDrop + 0.003, 0], q: q || Q.id() });

// the deck's named sites in the world (src/lib/skate/board.js:72-77) and the Sites overlay's marks (board.js:106)
export function deckSites(pose, d = board.DECK) {
  const L = d.length, local = { nose: [L / 2, board.kickY(L / 2, d), 0], tail: [-L / 2, board.kickY(L / 2, d), 0], grip: [0, d.thick / 2, 0], underside: [0, -d.thick / 2, 0], frontBolts: board.gripAt(d.wheelbase / 2, d), rearBolts: board.gripAt(-d.wheelbase / 2, d) };
  return Object.entries(local).map(([name, v]) => ({ name, p: V.add(pose.p, Q.rot(pose.q, v)) }));
}
export function drawSites(g, pose, d) { for (const s of deckSites(pose, d)) { g.ring(s.p, 0.012, { tone: 'green' }); g.label(s.name, s.p, { tone: 'green', dx: 6, dy: -6, size: 8 }); } }

// a rider posed by the figure's own code on a deck at rest: feet where the stance controller plants them (rider.js:58-62
// and 88-91, regular stance, default stanceFront 0.13 m and stanceRear 0.3 m), hips standHeight 0.95 m above them
// (rider.js:20), posture channels at their targets (figure.js postureFor), then figure.js buildPose
export function figurePose(o = {}) {
  const deck = o.deck || deckPose(), d = board.DECK;
  const site = x => V.add(deck.p, Q.rot(deck.q, board.gripAt(x, d)));
  const feet = { front: { p: site(o.stanceFront ?? 0.13), q: Q.mul(deck.q, Q.y(0.5)) }, rear: { p: site(-(o.stanceRear ?? 0.3)), q: Q.mul(deck.q, Q.y(0.15)) } };
  const mid = V.mul(V.add(feet.front.p, feet.rear.p), 0.5), hip = o.hip || V.add(mid, [0, o.standHeight ?? 0.95, 0]);
  const where = { body: hip, deck: deck.p };
  const w = { position: b => where[b], pose: b => feet[b] };
  const rider = { stance: 1, body: 'body', feet: { front: 'front', rear: 'rear' }, board: { deck: 'deck' } };
  const s = { stance: 1, phase: o.phase || 'ride', crouch: o.crouch || 0, lean: o.lean || 0, pushing: !!o.pushing, heading: o.heading || 0 };
  const T = figure.postureFor(s);
  return { F: figure.buildPose(w, rider, s, k => T[k] ?? 0), s, hip, feet };
}
// the hairline body and the Rig overlay, as figure.js:134-142 draws them
export function drawFigure(g, pose) {
  const { F, s, hip } = pose;
  for (const part of figure.PARTS) {
    const st = part.st.map(([j, o, a, b, ring]) => { const W = F.W[j]; return { c: figure.toW(F, j, o), A: Q.rot(W, [1, 0, 0]), B: Q.rot(W, part.ax === 'xy' ? [0, 1, 0] : [0, 0, 1]), a, b, ring: ring || 0 }; });
    g.loft(st, { bias: part.bias, meridian: part.meridian, name: part.key, chain: part.chain, after: part.key === 'head' ? dd => figure.drawFace(dd, F, s) : null });
  }
  if (g.on('rig')) {
    for (const [a, b] of figure.STICK) g.line(F.P[a], F.P[b], { tone: 'violet', width: 1 });
    for (let j = 0; j < F.P.length; j++) g.dot(F.P[j], 2.2, { tone: 'violet', hollow: true });
    if (hip) { g.dot(hip, 3.5, { tone: 'accent' }); g.label('COM', hip, { tone: 'accent', dx: 7, dy: -7, size: 8 }); }
  }
}

// the onion skin and flight paths of src/lib/skate/board.js:109-125, for any list of deck samples
// samples: [{ t, p, q }] one every 1/60 s (the history's spacing), oldest first
export function drawTrail(g, samples, d = board.DECK) {
  if (!g.on('trail') || !samples.length) return;
  let step = 5; while (samples.length > 18 * step) step *= 2;
  for (let i = 0; i < samples.length; i += step) board.drawBoard(g, samples[i], d, { ghost: (i + 1) / samples.length });
  if (samples.length > 1) {
    g.polyline(samples.map(p => p.p), { tone: 'blue', width: 1.2, alpha: 0.85 });
    g.polyline(samples.map(p => V.add(p.p, Q.rot(p.q, [d.length / 2, board.kickY(d.length / 2, d), 0]))), { tone: 'teal', width: 0.8, alpha: 0.6, dash: [3, 3] });
    const every = Math.max(1, Math.round(0.05 / (samples[1].t - samples[0].t || 0.05)));
    for (let i = 0; i < samples.length; i += every) g.dot(samples[i].p, 1.6, { tone: 'blue' });
  }
}
// the chronophotograph of content/presets/D-03/lab/chrono.js:13-24, for samples [{ t, hip, ff, rf, deck: { p, q } }]
export function drawChrono(g, s, every = 0.08) {
  if (s.length < 2) return;
  const dt = s[1].t - s[0].t || 1 / 60, k = Math.max(1, Math.round(every / dt));
  for (let i = 0; i < s.length; i += k) {
    const { hip, ff, rf, deck: dk } = s[i], a = 0.25 + 0.75 * i / s.length, h = hip, head = V.add(h, [0, 0.62, 0]);
    g.line(h, head, { tone: 'violet', alpha: a });
    g.line(h, ff, { tone: 'violet', alpha: a }); g.line(h, rf, { tone: 'violet', alpha: a });
    g.dot(head, 2.5, { tone: 'violet', alpha: a, hollow: true });
    const nose = V.add(dk.p, Q.rot(dk.q, [0.4, 0, 0])), tail = V.add(dk.p, Q.rot(dk.q, [-0.4, 0, 0]));
    g.line(nose, tail, { tone: 'blue', alpha: a, width: 1.6 });
  }
  g.polyline(s.map(x => x.hip), { tone: 'violet', dash: [2, 3], alpha: 0.6 });
}

// drawBoard(g, pose, dims = DECK, { ghost, roll }): the board as src/lib/skate/board.js draws it
export const drawBoard = (g, pose, d, o) => board.drawBoard(g, pose, d || board.DECK, o || {});

const api = { ...draft, truth, depthOrder, board, figure, V, Q, spring, clamp, OVERLAYS, ORDER_TOGGLES, DEFAULT_OVERLAYS, baseScale, sheet, onTheme, deckPose, deckSites, drawSites, figurePose, drawFigure, drawTrail, drawChrono, drawBoard };
window.FormSkateStage = Object.assign(window.FormSkateStage || {}, api);
