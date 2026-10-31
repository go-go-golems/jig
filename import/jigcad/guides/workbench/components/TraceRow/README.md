# TraceRow

One pinned signal or state over time: its id and type, the latest value and range, and a 56px plot drawn in ink on the page's ground.

## Use

The Traces view stacks `.trace` rows under its Toolbar (window 2, 5, 10 or 20 s; Freeze; a filter that adds traces). The header (`.trace-h`) has the id as a `.linkhd` in the code face, bold (click selects it in the graph), its kind and type in `.sub` ("signal · number"), the readout (`.tv`: "0.082   range 0.06 … 0.47", and for vectors "x solid · y dashed · z dotted"), and × to unpin.

The plot is a `canvas.spark` the view draws itself, reading the theme from CSS: the series in ink at 1.2px (vector components: x solid, y dashed 4 3, z dotted 1 2, the second and third in ink-2), the zero line in rule, events as dashed vertical ticks (pop and trick in ink-2 with the trick's name in 9px Arial; a bail in accent). The y range pads the data by 10%.

## Markup

```html
<div class="trace">
  <div class="trace-h"><button class="linkhd"><b>recognizer/height</b></button><span class="sub">signal · number</span><span class="tv">0.082   range 0.06 … 0.47</span><button class="x" aria-label="unpin recognizer/height">×</button></div>
  <canvas class="spark"></canvas>
</div>
```

## Do and don't

- Do read colours from the CSS variables at draw time so the plot follows the theme.
- Do separate series by dash pattern, not hue.
