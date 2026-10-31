# BookContents

The Book's left column: the book's title and progress, a search box, and the chapters by part with right-aligned numbers; a search replaces the list with matching chapters, their section and a snippet.

## Use

`nav.bcontents` (250px). The title block (`.btitle`): the book's title in 13px bold, "69 chapters" (or "41 of 69 chapters written") in ink-2. Parts are uppercase group headers ("Part VII · Drawing", "Appendices"); a chapter is a button with its number (`.bn`, 1.7em wide, right-aligned, ink-2, tabular; · for the preface, a letter for an appendix) and its title (`.bt`). The open chapter is bold with a 2px accent inset bar; an unwritten one (`.draft`) is ink-2.

Search ("search the book") keeps chapters that contain every word, most hits first, each with the section of the first hit in `em` and 170 characters around it in `small`. Nothing found: "No chapter mentions that."

In a tile under 700px the column slides in over the chapter from a Contents button, with a 12% black scrim.

## Markup

```html
<nav class="bcontents" aria-label="Contents of the book">
  <div class="btitle"><b>Kickflips from First Principles</b><small>69 chapters</small></div>
  <input class="filter" placeholder="search the book" aria-label="Search the book">
  <div class="bpart"><div class="grp">Part VII · Drawing</div><button class="on"><span class="bn">47</span><span class="bt">Drawing motion</span></button></div>
</nav>
```
