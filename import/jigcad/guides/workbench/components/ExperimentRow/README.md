# ExperimentRow

An experiment exported by the preset: its name, how many runs, a Run button, and when it has run, a header, a scatter plot with axis pickers and the table of runs.

## Use

The Experiments view lists `experiments.js`'s exports (`.explist`, one `.exprow` each): the name as a `.linkhd` in bold, "7 runs" (and "· last run 1.4 s" once run) in `.sub`, a spacer, and `Run` (`.btn.sm.primary`; disabled while another runs). A running row swaps Run for a Meter and Stop. The shown experiment is `.exprow.on` (2px accent inset bar).

Results open with `.reshd` (the name in bold, "7 runs" in `.sub`, a 2px ink rule above), then `.expres`: a toolbar of selects (x, y, series) and "mean by x", the scatter, and the Table.

The scatter (`svg.roof.scatter`, 520 × 260) draws grid lines in rule, tick labels and axis names in 9.5px ink-2, points as 3.6px circles: series 0 filled ink, others hollow with ink outlines and different marks (square, diamond, cross, triangle) and line dashes. Hovering a series turns its marks accent.

## Markup

```html
<div class="explist">
  <div class="exprow on"><button class="linkhd"><b>Pop height vs take-off speed</b></button><span class="sub">7 runs</span><span class="sp"></span><button class="btn sm primary">Run</button></div>
</div>
<div class="reshd"><b>Pop height vs take-off speed</b><span class="sub">7 runs</span></div>
```

## Do and don't

- Do tell series apart by mark shape and dash, never by colour alone.
- Do plot the real rows; the table under the plot holds every number.
