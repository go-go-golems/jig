# BookPartOpener

The block above the first chapter of a part: the part's number in small caps, its title under a heavy ink rule, its one-sentence about, closed by an ink rule.

## Use

Shown by BookChapter when the previous chapter is in another part (not for the front matter). Part numbers are roman (I to IX); the appendices read "Appendices". The about comes from `book.json` `parts[].about`.

## Markup

```html
<div class="doc bpartopen"><div class="lbl">Part VII</div><h2>Drawing</h2><p>The stage as a technical drawing: …</p></div>
```
