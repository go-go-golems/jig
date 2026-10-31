# Book figures in the stage's look

The book's figures are drawn "in the style of the stage": technical drawing, hairlines, ink, grey and one red accent, on the reader's theme. They are inline SVG, so they cannot use the canvas code; they reproduce its conventions by hand from computed coordinates. The rest of the book's rules (structure, captions, checking) are in **Form Skate Workbench** (https://claude.ai/artifact/5aW5wCqpBBTFm6rtezFLaG), under writing a book section.

## The block

A figure is a fenced block with the language `svg`, then a caption paragraph that starts `**Figure N.k.**`. The SVG has a `viewBox` at most 720 wide, no `<style>`, `<script>`, `<image>` or `<foreignObject>`, and no literal colours. The page renders it with the workbench's colours, not the stage's: the classes below map to `ink`, `ink-2`, `accent`, `hair`, `fill`, `fill-2`, `bg` and `sel`.

| stroke class | fill class | colour | use |
|---|---|---|---|
| `stroke="currentColor"` or `ink` | `f-ink` | ink | the subject, outlines, text |
| `mut` | `f-mut` | ink-2 | hatching, construction lines, axes, secondary text |
| `acc` | `f-acc` | accent red | the one thing the figure is about; a failure |
| `hair` | `f-fill`, `f-fill2` | hair; light and darker grey | rules; quiet areas |
|  | `f-paper` | the page | knock out lines behind a label; paper inside a solid |
|  | `f-sel` | faint red wash | a highlighted region |

Text classes: `lbl` (small capitals, tracked), `it` (italic, for variables), `b` (bold). Line classes: `dash`, `dot`. Text sizes 9 to 13.

There are no blue, green, violet, amber or teal classes. A figure that shows an overlay draws it in ink or `mut` and puts the one thing that matters in `acc`; the caption names what each line is.

## Stage conventions in SVG

| stage | in a figure |
|---|---|
| loft silhouette, 2 px stroked then paper-filled | the outline at `stroke-width="1"` (1.6 for the subject), with `class="f-paper"` inside when it must hide what is behind |
| rings and meridians, 0.55 px at 0.7 | `class="mut"` at `stroke-width="0.6"` |
| hatching, 0.6 px lines 6 px apart at 45° | the pattern below, `fill="url(#hatch)"` |
| ground line of an elevation | a 1.4 px line over an 18 px band of 0.6 px `mut` lines 7 px apart, clipped to the band |
| dimension line | 0.7 px extension lines, a 1 px line, 1.4 px 45° ticks 8 px across, the value centred on an `f-paper` patch |
| labels, Plex 9.5 px | `font-size="9"` to `"11"`; small capitals with `lbl` |
| scale bar | quarters, first and third filled 2 px high, `0` and the length at 9 px |

The hatch pattern, exactly as Figure 46.2 defines it:

```svg
<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6"><path d="M-1,7 L7,-1 M-1,1 L1,-1 M5,7 L7,5" fill="none" class="mut" stroke-width="0.6"/></pattern></defs>
```

Ids are made unique per figure when the page renders it, so every figure may call its pattern `hatch` and its arrowhead `arrow`.

## Compute, do not guess

Use the stage's own camera for the coordinates. In a page that loads this system's bundle:

```js
const S = window.FormSkateStage, v = S.VIEWS.axo;
const cam = S.makeCam(v.yaw, v.pitch, 120, [0, 0, 0], 640, 260);   // 120 px/m, centred on the origin
const p = S.proj(cam, [1, 0, 0]);                                    // a world point on the 640 × 260 sheet
const g = new S.Draft(); g.cam = cam;
const { E } = g.loftPath(S.board.sectionsOfDeck(S.board.DECK));      // each section's 20 projected points
const outline = S.hull2(E[8].concat(E[9]));                          // one hull between neighbouring sections
```

Write the numbers into the SVG rounded to 0.1 px. A figure that claims to show data (a path, a pose, a force) plots real numbers from the book's FACTS.md or a recorded run; a schematic looks like one and says so in its caption.

## Figure checklist

- One subject in ink at 1.6, the rest at 1 or 0.6.
- One accent, used for the point of the figure.
- Real scale stated in the caption (`at 120 px/m`) when lengths can be read off the figure.
- Every label names a thing the prose names, in the same words, with units.
- The caption says which view (axonometric, front, side, plan) and which moment (`t = 2.783 s`).
