The stage is a drafting sheet. Bodies are ink hairlines on white paper, seen in orthographic projection, with hatched sun shadows and small monospaced labels; colour appears only in overlays and signals, never in the drawing itself.

This system covers the Form Skate stage: the 2.5D view, its drawing conventions, the code that draws it, and the few HTML parts laid over it. The workbench around the stage (panels, editor, menus, the book) is **Form Skate Workbench** (https://claude.ai/artifact/5aW5wCqpBBTFm6rtezFLaG); the coding agent is **Form Skate Agent** (https://claude.ai/artifact/4KJ4g867ubqBbVszAeqXWM).

## What is here

- **Tokens.** The sheet's colours are the `st-*` tokens, in a light and a dark theme. The drawing's numbers (line widths, hatch pitch, opacities, dashes, dot sizes, the four views, the sheet furniture) are token families of their own: `stroke`, `hatch`, `opacity`, `dash`, `marks`, `camera`, `sheet`. Six workbench colours (`bg`, `ink`, `ink-2`, `fill`, `hair`, `accent`) and `on-accent` are repeated here, with the same names and values, for the hint line, the overlay menu and the fail banner.
- **`window.FormSkateStage`** (`components/bundle.js`): the stage's own drafting code, unchanged, plus `sheet()`, which builds a camera and draws a frame the way the stage does. `components/index.d.ts` lists every call. Use it; do not redraw the look by hand.
- **`components/bundle.css`**: the chips, trick toast, fail banner, hint line and overlay menu.
- **Sections**: projection and views, drawing bodies, shadows and ground, depth order, labels and dimensions, overlays, motion, and book figures.

## The rules

1. **Orthographic only.** Every view is a parallel projection: `x = W/2 + s (p − T)·r`, `y = Y0 − s (p − T)·u`. There are four named views: `axo` (yaw `view-axo-yaw` 38°, pitch `view-axo-pitch` 27°), `front`, `side` and `plan`. Orbiting adds to a view's yaw and pitch; it never adds perspective. Lengths parallel to the sheet share one scale, so the scale bar is valid anywhere on it.
2. **Lines, paper, hatch.** A solid is an outline stroked at `stroke-silhouette` (2 px) in `st-ink` and then filled with paper (`st-bg`), so it hides what is behind it. On its surface only thin lines: rings and meridians at `stroke-ring` (0.55 px), opacity `opacity-ring`. Tone is hatching, never grey fill: sun shadows, the ground band of an elevation, the lot's edge and the faces of props are 45° lines in `st-shadow` at `stroke-hatch` (0.6 px), `hatch-tile` (6 px) apart.
3. **Ink draws; hues annotate.** The rider, the board and the props are `st-ink` (a prop may take one overlay hue as its tone, as D-02's amber cones do). Each overlay has one hue and keeps it: `st-violet` the rig, `st-amber` forces, `st-rec` contacts, the centre of mass and anything that went wrong, `st-green` sites, `st-blue` paths, the course and landed dimensions, `st-teal` the nose path, `st-ghost` onion skins. Pick a hue by meaning from this list. Do not add hues.
4. **Labels.** Canvas text is IBM Plex Mono (`canvas-label`, 9.5 px, weight 500). Labels beside marks are 8 px in the mark's hue (`canvas-label-sm`). Dimension values are 8.5 px on a paper patch (`canvas-dim`). Trick names on the floor are in capitals; numbers carry units and two decimals (`1.62 m · 0.42 s`); parts of a label are joined by ` · `.
5. **Depth.** Solids are painted back to front. The order comes from a strategy in `depth-order.js` (`deck plane` by default) with chain outlines on, so each limb is one outline. A new solid gives itself a `name`; a flat part that others stand on gives its `plane`; parts under it say `under`; parts of one limb share a `chain`. Use `bias` (metres) only for a judgment no geometry can make, such as keeping the face in front of the neck.
6. **Layers.** Marks are flushed in a fixed order: `floor` (grid, boundary, floor marks), shadows, `ghost` (outlines only, never sorted), `figure` (solids, depth-sorted), `overlay` (lines, arrows, dots, labels). Put a mark on the lowest layer it belongs to.
7. **Motion is sampled time.** The past is drawn from the history (one sample every 1/60 s for 8 s), as ghosts every fifth sample, paths with a tick every 50 ms, or stick figures every 0.08 s, older ones fainter. The trail covers the last jump: take-off to landing plus 0.1 s.
8. **Square and quiet DOM.** Chips, the toast and the banner are square (`radius-none`), 1 px borders, inset `stage-inset` (12 px) from the stage's corners. The toast lives 2.6 s. Nothing else floats over the sheet.
9. **Dark theme.** Every colour is read from the `st-*` tokens at draw time (`readColors`), and the stage re-reads them 30 ms after the theme changes. Never hard-code a colour in a view: name a tone (`tone: 'blue'`) and the theme decides.
10. **Sheet furniture.** Every sheet has a scale bar bottom left. A sheet at least 640 × 460 px also has a title block bottom right: FORM SKATE, the sheet number, and one row per fact.

## Drawing a new body or overlay

1. Write a view in a library file: `$.view('cones', v => v.layer('figure').draw((g, ctx) => { … }))`. `ctx` has `world read param time frameDt local history events`.
2. Describe the body as stations, ellipses in space `{ c, A, B, a, b, ring }` (centre, two unit axes, two radii, ring flag), from its base up. Put `ring: 1` where the girth should read.
3. Draw it with `g.loft(stations, { name, tone, meridian, bias, chain, plane, under, ghost, after })`; a flat face is `g.poly(points, { fill: 'stage' | 'hatch' | 'soft' | 'none', name })`. Shadows, paper fill and depth order follow by themselves.
4. Annotate on the `overlay` layer behind a switch: `if (!g.on('forces')) return;` then `g.arrow(p, vector, { tone: 'amber' })`, `g.dot(p, 2, { tone })`, `g.label('667 N', p, { tone, dx: 6, size: 8 })`. Scale forces in metres per newton and say the scale in the label or the caption.
5. Press Run in the workbench and look at all four views and both themes. Turn on Order ▸ Truth to see any cells the depth order gets wrong.

Outside the workbench, the same marks go through `FormSkateStage.sheet(canvas, { view: 'axo', scale: 150 }).draw(g => { … }, { scaleBar: true })`: it sizes the canvas, reads the tokens, builds the stage's camera and flushes the layers.

## Content

- Trick names: lower case in data (`kickflip`), capitals on the sheet (`KICKFLIP · 1.62 m · 0.42 s`) and in the toast. A bail adds ` · bail` (`HEELFLIP · BAIL`) and turns `st-rec`.
- Chips are terse capitals (`AUTOPILOT`, `YOU`, `● REC 12 s`, `REPLAY`). Ghost chips are hints in lower case (`click the stage, then ↑ to push`).
- The hint line opens with a bold state (`Click the stage`, `Riding`, `Replay`) followed by keys and gestures joined by ` · `.
- Measurements show two decimals with their unit: `flip 0.99 · shove 0.00 · air 0.42 s · +850`.

## Iconography

The stage uses no icon set and no logo. Glyphs are text: `↑ ← →` for keys, `●` for recording, `▾` for menus, `·` as a separator. The title block's mark is the words FORM SKATE in bold Arial.
