// theme.js: the sheet's colours (the st-* tokens, read at draw time), its numbers (the stroke, hatch, opacity, dash
// and sheet token families), the 45° hatch and the canvas text, as the Form Skate stage defines them.

// the st-* tokens in both themes (guides/stage/tokens.json): used when the page has not loaded tokens.css
export const PALETTE = {
  light: { 'st-bg': '#ffffff', 'st-grid': '#efefef', 'st-major': '#dcdcdc', 'st-shadow': '#9a9a9a', 'st-ink': '#111111', 'st-muted': '#6e6e6e', 'st-rec': '#d23a2a', 'st-warn': '#b0650a', 'st-soft': '#f0f0f0', 'st-blue': '#1f6fc4', 'st-green': '#1e8a5a', 'st-violet': '#7b45c9', 'st-amber': '#d98e04', 'st-teal': '#12868f', 'st-ghost': '#4a86c8' },
  dark: { 'st-bg': '#101010', 'st-grid': '#1a1a1a', 'st-major': '#262626', 'st-shadow': '#5e5e5e', 'st-ink': '#f2f2f2', 'st-muted': '#9a9a9a', 'st-rec': '#ff5a48', 'st-warn': '#f0a83c', 'st-soft': '#222222', 'st-blue': '#4da3ff', 'st-green': '#3ecf8e', 'st-violet': '#a77bff', 'st-amber': '#ffb627', 'st-teal': '#2fc4cf', 'st-ghost': '#6aa8f0' },
};
const NAMES = { stage: 'st-bg', grid: 'st-grid', major: 'st-major', shadow: 'st-shadow', ink: 'st-ink', muted: 'st-muted', accent: 'st-rec', red: 'st-rec', warn: 'st-warn', soft: 'st-soft', blue: 'st-blue', green: 'st-green', violet: 'st-violet', amber: 'st-amber', teal: 'st-teal', ghost: 'st-ghost' };

// the drawing's numbers (tokens.css: stroke-*, hatch-*, opacity-*, dash-*, dot-*, dim-*, title-block-*, scale-bar-*)
export const K = {
  silhouette: 2, ring: 0.55, ghost: 0.8, ground: 1.4, grid: 0.6, hatch: 0.6, poly: 1, overlay: 1, dimExt: 0.7, dimTick: 1.4,
  hatchTile: 6, groundPitch: 7, groundBand: 18, ringAlpha: 0.7, dimTickPx: 8, dimOvershoot: 0.12,
  titleW: 250, titleRow: 15, titleMin: [640, 460], scaleInset: [14, 18], inset: 12,
  dashHidden: [3, 2], dashConstruction: [4, 3], label: 9.5, labelSm: 8, dim: 8.5, key: 9,
};
export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
export const DISPLAY = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

export function themeOf(el) {
  const root = (el && el.ownerDocument || globalThis.document)?.documentElement;
  const t = root && root.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t;
  return globalThis.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// readColors(el, theme?): the palette by tone name, from the st-* custom properties on el (or the fallback palette
// of the theme in force when the page has none). Called at the start of every draw.
export function readColors(el, theme) {
  const t = theme || themeOf(el), fb = PALETTE[t] || PALETTE.light, C = { theme: t };
  let cs = null;
  if (!theme && el && globalThis.getComputedStyle) try { cs = getComputedStyle(el); } catch { cs = null; }
  for (const [k, tok] of Object.entries(NAMES)) C[k] = (cs && cs.getPropertyValue('--' + tok).trim()) || fb[tok];
  return C;
}
export const toneOf = (C, t, d) => !t ? (d || C.ink) : C[t] || (/^(#|rgb|hsl)/.test(t) ? t : (d || C.ink));

// a CSS colour as a little-endian RGBA uint32 (for ImageData writes)
const rgbaCache = new Map();
export function rgba32(col, alpha = 1) {
  const key = col + '|' + alpha;
  if (rgbaCache.has(key)) return rgbaCache.get(key);
  let r = 0, g = 0, b = 0;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(col.trim());
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else if (globalThis.document) {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 1, 1);
    [r, g, b] = x.getImageData(0, 0, 1, 1).data;
  }
  const v = ((Math.round(alpha * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0;
  rgbaCache.set(key, v);
  return v;
}

// the hatch (shadows-and-ground.md): a 6 px tile with one 0.6 px line corner to corner rising to the right at 45°,
// overshooting a pixel at each end, plus the two corner strokes joining it to its neighbours, drawn at twice the
// size and scaled by half. Cached per context and colour.
const hatchCache = new WeakMap();
export function hatchPattern(ctx, col, width = K.hatch) {
  let m = hatchCache.get(ctx); if (!m) hatchCache.set(ctx, m = new Map());
  const key = col + '|' + width;
  if (m.has(key)) return m.get(key);
  const s = K.hatchTile, c = document.createElement('canvas'); c.width = c.height = s * 2;
  const x = c.getContext('2d'); x.scale(2, 2);
  x.strokeStyle = col; x.lineWidth = width; x.beginPath();
  x.moveTo(-1, s + 1); x.lineTo(s + 1, -1); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(s - 1, s + 1); x.lineTo(s + 1, s - 1);
  x.stroke();
  const p = ctx.createPattern(c, 'repeat');
  if (p && p.setTransform) p.setTransform(new DOMMatrix().scale(0.5));
  m.set(key, p);
  return p;
}

// text(ctx, C, s, x, y, o): Plex at weight 500, vertically centred; bg puts a paper patch 3 px wider each side and
// 4 px taller behind it (labels-and-dimensions.md)
export function text(ctx, C, s, x, y, o = {}) {
  const size = o.size || 10;
  ctx.font = `${o.w || 500} ${size}px ${o.mono === false ? DISPLAY : MONO}`;
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
  if (o.bg) {
    const w = ctx.measureText(s).width, h = size + 4, x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    ctx.fillStyle = o.bg; ctx.fillRect(x0 - 3, y - h / 2, w + 6, h);
  }
  ctx.fillStyle = o.col || C.ink; ctx.fillText(s, x, y);
}
export function textWidth(ctx, s, size = 10, w = 500) { ctx.font = `${w} ${size}px ${MONO}`; return ctx.measureText(s).width; }

// call fn 30 ms after the theme changes (data-theme on the root, or the system scheme); returns a stop function
export function onTheme(fn, doc = globalThis.document) {
  if (!doc) return () => {};
  let t = 0;
  const again = () => { clearTimeout(t); t = setTimeout(fn, 30); };
  const mo = new MutationObserver(again); mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  const mq = globalThis.matchMedia && matchMedia('(prefers-color-scheme: dark)');
  if (mq && mq.addEventListener) mq.addEventListener('change', again);
  return () => { clearTimeout(t); mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', again); };
}

// IBM Plex Mono for the canvas: registered from `base` (the build copies the woff2 files to dist/fonts) unless the
// page already has the face. Resolves when the 500 weight can draw.
let fontsPromise = null;
export function loadFonts(base = 'fonts/') {
  if (fontsPromise) return fontsPromise;
  const doc = globalThis.document;
  if (!doc || !doc.fonts || !globalThis.FontFace) return (fontsPromise = Promise.resolve(false));
  const has = [...doc.fonts].some(f => /IBM Plex Mono/.test(f.family));
  if (!has) for (const w of [400, 500, 600, 700]) {
    try {
      const url = new URL(`${base}ibm-plex-mono-latin-${w}-normal.woff2`, doc.baseURI).href;
      doc.fonts.add(new FontFace('IBM Plex Mono', `url("${url}") format("woff2")`, { weight: String(w), style: 'normal', display: 'swap' }));
    } catch { /* a bad base: the fallback monospace draws */ }
  }
  fontsPromise = Promise.all([doc.fonts.load(`500 10px ${MONO}`), doc.fonts.load(`700 10px ${MONO}`)]).then(() => true, () => false);
  return fontsPromise;
}
