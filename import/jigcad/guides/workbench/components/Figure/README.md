# Figure

An inline SVG drawing in the stage's drafting style, scaled to the column and coloured by the theme, with a numbered caption.

## Use

Written as a fenced block with the language `svg`, followed by a paragraph that starts with `**Figure N.k.**`; `app/markdown.js` turns it into `figure.fig` with the SVG (sanitised, ids made unique, `class="figsvg"`, the root's width becomes its max-width) and a `figcaption` (12px ink-2, 68 characters wide, the bold label in ink).

Colour comes only from classes so the drawing works in both themes:

| class | is | use |
|---|---|---|
| `currentColor` / `ink` | ink stroke | the subject and outlines |
| `mut` | ink-2 stroke (or text fill) | axes, ground, secondary lines |
| `acc` | accent stroke (or text fill) | the one thing the figure is about |
| `hair` | hair stroke | construction lines |
| `f-ink` `f-mut` `f-acc` | fills | arrowheads, dots |
| `f-fill` `f-fill2` | grey fills | areas |
| `f-paper` | bg fill | knock out lines behind a label |
| `f-sel` | sel fill | a faint red region |
| `dash` `dot` | 4 3 and 1 3 dashes | centre lines, free paths |
| `lbl` `it` `b` | 10px uppercase spaced, italic, bold | labels, variables, emphasis |

Line weights: 1 for outlines, 1.6 for the subject, 0.6 for hatching and construction. Text 9 to 13px in the page's font. Arrowheads are markers with `f-ink` paths.

## Markup

````markdown
```svg
<svg viewBox="0 0 520 170" font-size="11">…</svg>
```

**Figure 12.1.** The board side-on: deck, two wheels and an upward force at the centre.
````

## Do and don't

- Do plot real numbers when a figure claims to show data.
- Don't write a literal colour (`stroke="#e2001a"`) or a `<style>`; the checker rejects both.
