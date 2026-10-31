# GraphDiagram

The dataflow graph: one column per phase, systems as 168 × 40 boxes, edges as hairline curves with arrowheads; the selected node and its edges in accent.

## Use

`svg.graph` inside `.diagram.graphscroll` (on the stage colour, scrolls both ways). Columns are headed "1. INPUT", "2. CONTROLS"… in 10px uppercase ink-2 (`.colhd`). Nodes are `g.node.<kind>`:

- `system`: a white box with an ink outline, its id bold (`.nl`, 11.5px) and its phase small (`.ns`, 9.5px, ink-2).
- `signals`: a group of derived signals; rounded (rx 10) and dashed (4 2), labelled "λ 3 signals".
- `watch`: filled and marked with a 2px corner at the top right.
- `.sel`: accent outline 2px; `.bad`: accent outline on a sel wash (the system that stopped); `.dim`: hair outline, ink-2 text.

Edges are `g.edge` > `path` in ink-2 with the `ah` arrowhead. A dashed edge (`.dash`, 4 3) means the reader runs before the writer in the step, so it sees the previous step's value. Edges of the selected node turn accent and carry a label of the states they carry (`.elabel`). Hover turns an edge ink.

## Markup

```html
<svg class="graph" width="1640" height="398">
  <text class="colhd" x="16" y="18">1. input</text>
  <g class="edge dash"><path d="M184,54 C…" marker-end="url(#ah)"/></g>
  <g class="node system sel" transform="translate(248,142)"><rect width="168" height="40" rx="0"/><text class="nl" x="8" y="16">pop/pop</text><text class="ns" x="8" y="31">controls</text></g>
</svg>
```

## Do and don't

- Do encode kinds by outline, dash and corner marks, not by hue.
- Do say in the toolbar what a dashed edge means.
- Don't draw more than one accent: only the selection or the failure is red.
