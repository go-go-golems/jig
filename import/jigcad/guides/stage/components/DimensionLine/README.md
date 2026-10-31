# Dimension line

A drafting dimension on the floor: extension lines, an offset line with 45° ticks, and the value on a paper patch.

**Provide** two floor points and a label: `g.dimension(a, b, 'KICKFLIP · 1.62 m · 0.42 s', { offset: 0.45, tone: 'blue', alpha })` on the `floor` layer.

- Line 1 px, extension lines 0.7 px overshooting 12%, ticks 1.4 px across 8 px at any zoom, value 8.5 px Plex.
- The Dims overlay draws the last four tricks, landed in `st-blue` and bails in `st-rec`, at opacity 0.35 + 0.65 (i + 1)/n.
- It measures horizontal distance only (points under 5 cm apart draw nothing) and is true length only in plan.
- Don't use it for heights; draw a vertical `g.line` with a `g.label` instead.
