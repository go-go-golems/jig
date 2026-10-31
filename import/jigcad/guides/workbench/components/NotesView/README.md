# NotesView

A preset's notes: a toolbar naming the preset with an Edit toggle, the notes as a Doc, then related lists; in edit mode a plain Markdown textarea with a help line.

## Use

`.notes` (a column): the toolbar's `.ntitle` reads "B-01 **Flatground** · Basics"; "revert notes" (a TextLink) appears when the notes were edited; Edit is a Toggle. Reading mode renders the preset's Markdown (see Doc) and adds "Further reading on the shelf" and "In the book". Edit mode (`.notes-edit`) is a borderless textarea on code-bg in the code face (12px/1.6, 14px 18px padding) with an `.ed-foot` that says what the notes accept: "Markdown with `$…$` and `$$…$$` math, `> **Try it**` callouts and links like `[open](lab:open?file=main.js&line=20)`. Saved in this browser."

## Markup

```html
<div class="tabbody col notes">
  <div class="toolbar"><span class="ntitle"><span class="pcode">B-01</span> <b>Flatground</b> <span class="pcode">· Basics</span></span><span class="sp"></span><button class="tog">Edit</button></div>
  <div class="scroll"><article class="doc">…</article></div>
</div>
```
