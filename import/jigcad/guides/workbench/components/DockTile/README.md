# DockTile

A tile of the dock: a 40px strip of view tabs over the view's body; tiles sit side by side or stacked, split by 1 px gutters you drag to resize.

## Use

The workbench is one dock (`.dock`) of nested splits (`.dsplit.row` / `.dsplit.col`, each child a `.dcell` sized by flex) ending in tiles (`section.tile`). A tile's strip (`.dstrip`) holds its tabs (`.dtabs` > `.dtab`) and a `+` (`.tabact.plus`) that opens a closed view in this tile. Tab labels are the view's one-word title: Notes, Docs, Book, Code, Agent, Reference, Stage, Graph, IR, Traces, Events, Params, Experiments.

- Active tab: `.dtab.on`, ink, 700, with a 1 px ink underline (inset shadow).
- A badge (`.count`) after the label: a count in a 1 px box (Traces 4, Params 3); `.count.bad` in accent for errors (Code 1).
- Close (`.x`, ×) appears on hover and on the active tab; it turns accent on hover.
- Gutters (`.gutter.row` 1 px wide, `.gutter.col` 1 px high) have an invisible 9px grab zone and turn ink on hover or focus; they are focusable (`role="separator"`).

The tile body (`.tilebody`) is a size container named `tile`: views switch to one column under 640px of tile width, not window width.

## Markup

```html
<section class="tile" data-tile="t1">
  <div class="dstrip">
    <div class="dtabs" role="tablist">
      <div class="dtab on"><button class="lbl" role="tab" aria-selected="true">Traces<span class="count">4</span></button><button class="x" aria-label="Close Traces">×</button></div>
    </div>
    <div class="rel"><button class="tabact plus" title="Open a view in this tile">+</button></div>
  </div>
  <div class="tilebody">…the view…</div>
</section>
```

## Do and don't

- Do let people move views: tabs drag onto another strip (move), a tile's edge (split) or its middle (join). See DragFeedback.
- Don't add view-level chrome above the strip; a view starts with its own Toolbar.

## Known issue

In the app, an older editor rule in `app/kiln.css` (`.gutter { width: 44px; border-right: … }`) also matches the dock's gutters, so a horizontal gutter (`.gutter.col`) is 44px wide instead of spanning its split, and only its left 44px can be dragged. `components/bundle.css` leaves that rule out; the editor's own gutter is `.egutter`.
