# Sheet furniture

The scale bar, bottom left on every sheet, and the title block, bottom right on any sheet at least 640 × 460 px.

**Provide** `draw(fn, { scaleBar: true, titleBlock: { sheet: 'D-01', rows: [['PRESET', '…'], ['LAST TRICK', '…'], ['SPEED', '…'], ['VIEW', '…']] } })` to `sheet()`, or call `titleBlock(ctx, g, cam, rows, sheet)` and `scaleBar(ctx, g, cam)` after `g.flush(ctx)`.

- Scale bar: 1 m (25 cm when 1 m passes 30% of the width, 5 m when 1 m is under 40 px), quarters with the first and third filled.
- Title block: 250 px wide, 10 px from the corner; `FORM SKATE` in bold Arial and `SHEET <id>` in the header; keys in `st-muted` at 9 px, values at 9.5 px.
- Rows the stage uses: PRESET, LAST TRICK, SPEED, VIEW live; CLIP, FRAME, LAST TRICK, ORDER, TRUTH in replay (sheet R-01).
- Don't drop the scale bar: it is the only thing that gives the sheet a size.
