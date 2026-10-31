# IconButton

A 32px square button that shows one text glyph; also the borderless tab action used for + and ↺.

## Use

`.ibtn` holds a single glyph with an `aria-label` and a `title` that says what it does and its shortcut: run controls (▶ / ❚❚ Play and Pause, ⏭ "Step 1/120 s (Shift: 12 steps)", ↺ "Reset the world (keeps the code)"), the book's ‹ › previous and next chapter, the theme switch. `.tabact` is a full-height, borderless action at the end of a strip (the + that opens a view in a tile) or a row (the ↺ that resets one parameter).

## Markup

```html
<button class="ibtn" title="Pause" aria-label="Pause">❚❚</button>
<button class="ibtn" title="Step 1/120 s (Shift: 12 steps)" aria-label="Step">⏭</button>
<button class="ibtn" disabled aria-label="Previous chapter">‹</button>
<button class="tabact plus" title="Open a view in this tile">+</button>
<button class="tabact" title="default 15">↺</button>
```

## States

- At rest: no border. Hover: a hair border appears.
- Disabled: the browser's default dimming; keep the glyph so the layout does not jump.
- Inside `.runctl` it shrinks to 28px.

## Glyphs

Use the glyphs the app uses, set in the UI font: ▶ ❚❚ ⏭ ⏮ ↺ ‹ › × + ▾ ▸ ■. The theme switch draws its sun, moon and half disc as a 16px inline SVG with `stroke="currentColor"` and stroke-width 1.4, because those glyphs are missing from many fonts. No icon fonts, no emoji.
