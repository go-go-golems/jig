# Menu

A dropdown opened from a button: an ink-bordered box on bg, one item per row with a title and a small description, grouped by small headers.

## Use

Menus hold choices and commands that do not fit a toolbar: presets, files, layouts, export formats, overlays, depth-order strategies, clips. `Menu` in `app/ui/common.jsx` renders `<div class="rel">` with the button and, when open, `<div class="menu">` below it (6px gap). Clicking an item closes it unless the item has `data-keep` (checkbox rows, fields); a click outside or Escape closes it.

Each item is a `button` with:

- an optional `.code` column (preset ids: B-01), 34px;
- `.t`, the title, sentence case ("Export project", "The whole book as an e-book");
- `small`, one line of ink-2 that says what happens or what you get (".epub for Apple Books, Kobo, Calibre and other readers", "files, notes and settings as .json").

Group with `.grp` (preset groups: Basics, Physics…) or `.mh` (a header: "Library — every file is editable", "Depth order <small>src/lib/depth-order.js</small>"). Separate command sections with `hr`. A closing `p.note` explains a rule of the menu ("Drag a tab to move it; drop it on a tile's edge to split. The layout is kept in this browser.").

## Variants

- `.menu.right`: aligned to the button's right edge (menus near the right side).
- Check rows: `<span class="box on">` (a 9px square, filled when on) before `.t`; radio rows: `<span class="radio on">` (the only round mark in the system). Used by Show, Order and Clip.
- `.on` on an item: the current choice, bold.
- `button.danger`: accent text, for Delete.
- `button:disabled`: 45% opacity, no hover ("Replay" before anything is recorded).
- Widths: `.presets` 380px, `.files` 300px, `.bexport` 300px, `.layouts` 290px, `.overlays` 280px, `.ordermenu`/`.clipmenu` 340px.

## Do and don't

- Do describe every item in its `small` line; a menu is where the workbench explains itself.
- Do end a label that opens a file picker or a second step with "…" ("Import project…", "Load clip…").
- Don't nest menus.
