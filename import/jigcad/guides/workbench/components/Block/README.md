# Block

A section of a side column or inspector: a heading row (bold title and a small sub label) over its content, closed by a hair rule. There are no cards and no tinted panels; blocks are separated by rules only.

## Use

Put blocks in `aside.side` (288px, hair rule on its left, scrolls on its own; hidden when its view is narrower than 560px) or at the top of a scrolling view. A block is a flex column with 8px gaps: `header` (h2 in block-title style, `.sub` in ui-small ink-2), then a note, a KeyValue list, a Table, a row of `.actions` links, a grid of buttons. In the side column the padding is 12px 14px; elsewhere 12px 16px 14px.

- `.note`: ink-2, fs-xs, explains the block in a sentence ("Signals are expressions over the world, compiled into one shared DAG and evaluated once per step in the **signals** phase.").
- `.empty`: what is there when there is nothing ("None yet.", "Select a node in the graph, a glyph in the code gutter, or a `lab:node` link.").
- `.actions`: a row of TextLinks under the content.

## Markup

```html
<aside class="side">
  <div class="block">
    <header><h2>Trick pad</h2><span class="sub">plays the gesture from skate/controls.js</span></header>
    …
  </div>
</aside>
```

## Do and don't

- Do title blocks with a noun (Score, Reads, Writes, Live, Range, Keys) and put the qualifier in `.sub` ("combo ×1", "t = 7.36 s", "6").
- Don't box a block with a border or a fill; the rule below it is the only separation.
