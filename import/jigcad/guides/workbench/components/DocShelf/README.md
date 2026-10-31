# DocShelf

The Docs view's left column: a search box and the shelf of documents grouped by subject, each entry its title over its one-line about.

## Use

`div.docsview` holds `nav.shelf` (230px, hair rule on the right) and the document's `.scroll`. Groups are 10.5px uppercase ink-2 headers (Start here, Maths, Mechanics, Control, Contact, The board, Computation, Drawing, Method). An entry is a button: the title at 12px (bold when open, with a 2px accent inset bar), the about in ink-2 at 10.5px. The search filters on title, about and body. Under 620px of tile width the shelf moves above the document (34% of the height).

The Book's contents column (BookContents) is built the same way.

## Markup

```html
<div class="tabbody docsview">
  <nav class="shelf">
    <input class="filter" placeholder="search the shelf">
    <div class="shelfgrp"><div class="grp">Start here</div><button class="on"><b>A tour of the workbench</b><small>What each view is for…</small></button></div>
  </nav>
  <div class="scroll"><article class="doc">…</article></div>
</div>
```

## Do and don't

- Do write each doc's about as one sentence that names what it covers.
- Don't nest groups.
