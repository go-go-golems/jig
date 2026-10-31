# Labels

Text on the sheet: IBM Plex Mono at weight 500, centred on a world point, a fixed pixel size at any zoom.

**Provide** `g.label(text, p, { size, tone, dx, dy, align, bg, weight })`.

- 9.5 px default; 8 px beside a mark in the mark's hue; 8.5 px for dimension values; `bg: true` for a paper patch that breaks a line.
- Units always, two decimals, parts joined by ` · `; trick names in capitals on the floor.
- Some light-theme hues sit just under 4.5:1 as 8 px text (`st-green` 4.34, `st-teal` 4.35, `st-warn` 4.46, `st-amber` 2.68): use `bg: true` or ink for a value that must be read.
- Don't use bold for emphasis or set a sentence on the sheet.
