# Table

A plain data table: hair rule under the header, faint rules between rows, the last column right-aligned, tabular figures throughout.

## Use

`table.rt` for runs, results and logs: the stage's Last tricks, an experiment's results (the preview shows E-01's seven runs of Pop height vs take-off speed), the depth-order scores. Header cells are ink-2 fs-xs, 400. Numeric columns take `.num` (right-aligned, 10px right padding) and are printed with `+x.toFixed(3)`. Row states:

- `tr.badrow`: every cell in accent (a bail, a failed run).
- `tr.dimrow`: ink-2 (a run that does not count).
- `tr.sel`: an accent underline and a 2px accent bar on the first cell.
- `tr.clickable`: pointer, fill on hover.
- `td .bad` marks one bad value.

Wide tables scroll inside `.tablewrap-x`, never the page.

## Markup

```html
<table class="rt">
  <thead><tr><th>t</th><th>trick</th><th>air</th><th>score</th></tr></thead>
  <tbody><tr><td>3.2</td><td>kickflip</td><td>0.42</td><td>850</td></tr></tbody>
</table>
```

## Do and don't

- Do name columns by the measured quantity, lowercase, with the unit in the name when it has one (misdrawn_cm2, air).
- Don't zebra-stripe or box cells.
