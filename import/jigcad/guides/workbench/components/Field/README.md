# Field

Text inputs, selects and range sliders: square, hairline, on bg (or code-bg for code and names), with placeholders that say what to type.

## Use

- **`.filter`**: the search or filter box at the start of a toolbar or the top of a column, 30px high, 160px wide (auto in the shelf and contents). Placeholders are lowercase and specific: "search the shelf", "search the book", "filter lines", "filter", "add a trace: filter signals and states".
- **`.evsearch`**: the same box at 130px in the Events toolbar.
- **`select`** in a toolbar: 30px high, hair border, bg. Option text says the value with its unit or role ("1×", "every 2nd frame", "Compare: off").
- **`input[type=range]`**: `accent-color: var(--ink)`. In a toolbar it is 92px wide after a `.lbl` ("Zoom"); in a parameter row it fills its cell.
- **`.newfile input`**: a name typed inside a menu ("new file, e.g. skate/grind.js", "save as my preset: title"), on code-bg in the code face.

## Markup

```html
<input class="filter" placeholder="filter lines">
<span class="lbl">Zoom</span><input type="range" min="0.25" max="4" step="0.05" aria-label="Zoom">
<select aria-label="Time scale"><option>1×</option><option>0.5×</option></select>
```

## States

Focus: the border turns ink and the outline is removed (the border is the focus mark). Enter commits where a field creates something; Escape closes the menu around it.

## Do and don't

- Do label a field by its placeholder or a `.lbl` before it, and give it an `aria-label`.
- Don't add clear buttons, icons in fields or rounded corners.
