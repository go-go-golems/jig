# Labels and dimensions

Text on the sheet is small, monospaced and placed by the world point it describes. It states a fact with its unit; it never decorates.

## Labels

```js
// app/draft.js:357-358 and 374-379
const p = proj(cam, m.p); this.text(ctx, m.text, p[0] + (o.dx || 0), p[1] + (o.dy || 0), { size: o.size || 9.5, col, align: o.align, bg: o.bg ? C.stage : null, w: o.weight });
text(ctx, s, x, y, o = {}) {
  ctx.font = `${o.w || 500} ${o.size || 10}px ${o.mono === false ? 'Arial, Helvetica, sans-serif' : MONO}`;
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
  if (o.bg) { const w = ctx.measureText(s).width, h = (o.size || 10) + 4, x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x; ctx.fillStyle = o.bg; ctx.fillRect(x0 - 3, y - h / 2, w + 6, h); }
  ctx.fillStyle = o.col || this.C.ink; ctx.fillText(s, x, y);
}
```

`g.label(text, p, { dx, dy, size, align, bg, weight, tone })`:

- The face is IBM Plex Mono at weight 500, vertically centred on the point. Sizes are CSS pixels and do not change with zoom.
- **9.5 px** (`canvas-label`) is the default: a free label, a title-block value.
- **8 px** (`canvas-label-sm`) is a label beside its own mark, in the mark's hue, offset a few pixels: `COM` at `dx: 7, dy: -7`; a force `667 N` at `dx: 6` past the arrow's tip; a site name at `dx: 6, dy: -6`.
- **8.5 px** (`canvas-dim`) is a dimension value.
- `bg: true` puts a paper patch 3 px wider on each side and 4 px taller than the text behind it, so the label breaks a line instead of crossing it. Use it whenever a label sits on a line or a hatch.
- `weight: 700` is for a heading on the sheet (a compare sheet's name), not for emphasis inside a label.

The only text not in Plex is the title block's `FORM SKATE`, bold Arial at 9.5 px (`canvas-title`).

### Writing labels

- Name things as the code and the book name them: `COM`, `frontBolts`, `centre around the foot`.
- Numbers carry units and fixed decimals: `0.42 s`, `1.62 m`, `667 N`; a count of turns has two decimals (`flip 0.99`).
- Join parts with ` · `: `KICKFLIP · 1.62 m · 0.42 s`.
- Trick names on the floor are in capitals; everything else keeps its case.
- Keep a label to one line. If it needs a sentence, it belongs in the panel beside the stage or in the book.

## Dimension lines

`g.dimension(a, b, text, { offset, tone, alpha })` measures the horizontal distance between two floor points:

```js
// app/draft.js:362-373
const a = m.a, b = m.b, d = V.sub(b, a), L = Math.hypot(d[0], d[2]); if (L < 0.05) return;
const n = [-d[2] / L * off, 0, d[0] / L * off];
const A = V.add(a, n), B = V.add(b, n), pa = proj(cam, a), pb = proj(cam, b), qa = proj(cam, A), qb = proj(cam, B);
ctx.lineWidth = 0.7; /* extension lines from a and b to 12% past the dimension line */
ctx.lineWidth = 1;   /* the dimension line from A to B */
for (const q of [qa, qb]) { ctx.beginPath(); ctx.moveTo(q[0] - 4, q[1] + 4); ctx.lineTo(q[0] + 4, q[1] - 4); ctx.lineWidth = 1.4; ctx.stroke(); }
this.text(ctx, m.text, mid[0], mid[1], { size: 8.5, col, align: 'center', bg: C.stage });
```

- The line is offset sideways by `offset` metres (default 0.4; the trick dimensions use 0.45), to the left of the direction from `a` to `b`.
- Extension lines are `stroke-dim-ext` (0.7 px) and overshoot by `dim-overshoot` (12%); the line is `stroke-overlay` (1 px); the end ticks are `stroke-dim-tick` (1.4 px) diagonals `dim-tick` (8 × 8 px) in screen space, so they keep their size at any zoom.
- The value sits centred on the line, on a paper patch.
- It measures horizontal distances only: points closer than 5 cm in plan draw nothing, so a height needs `g.line` and `g.label` instead. It is at true length in plan and foreshortened in the other views.

The Dims overlay (`annotations`) draws one for each of the last four tricks, take-off to landing: `st-blue` when landed, `st-rec` for a bail, with opacity `0.35 + 0.65 (i + 1)/n` so the newest is solid (recognizer.js:149-158).

## Sheet furniture

- **Scale bar** (draft.js:407-414), always, bottom left: 14 px from the left, 18 px from the bottom (`scale-bar-inset`). One metre, or 25 cm if a metre would pass 30% of the width, or 5 m if a metre is under 40 px. Quarters, the first and third filled 2 px high; `0` and the length at 9 px. It is exact for lengths parallel to the sheet; in the axonometric view a metre along `x` is 0.836 of it and a metre up 0.891.
- **Title block** (draft.js:399-406), bottom right, only on a sheet at least 640 × 460 px (`title-block-min`): a 250 px box (`title-block-width`), 10 px from the edges, a 17 px header with `FORM SKATE` and `SHEET <id>` (the preset's id, `R-01` in replay), then 15 px rows (`title-block-row`) of key (9 px, `st-muted`) and value (9.5 px; a value over 25 characters is cut to 24 and an ellipsis). The live stage shows PRESET, LAST TRICK, SPEED and VIEW.
