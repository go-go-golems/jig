# Writing a jig preset

A preset is a real thing someone would print, written as a short, readable jig script with the handful of parameters a person would actually change, plus notes that teach one idea well. The shelf runs from first prints to advanced builds; each preset should be worth printing.

## Files: `content/presets/<ID>-<slug>/`

- `script.js`: a **function body** returning a builder. In scope: `j`, the bare units (`mm cm m um inch ft deg rad turn kg gram N kN MPa GPa s minute hour degC usd eur lw layer nozzle bbox`) and `data` (parsed data files of the folder). Start with a two-line header comment: `// <ID> · <Title>: <one line>` and what to notice.
- `notes.md`: the reading view (see below).
- `meta.json`: `{ "id": "H-03", "title": "Soap dish with drain slots", "group": "Around the house", "order": 3, "difficulty": "first print" | "easy" | "medium" | "advanced", "about": "<lowercase one-line description>", "view": "axo" | "front" | "side" | "plan", "overlays": "shadows,grid,dims", "tries": "<agent suggestion> | <agent suggestion>", "agent": { "role": "a <kind of> designer who …", "prompt": "Prefer …; never …", "fragments": { "<name>": "<instruction>" }, "defaultFragments": ["<name>"] } }`.
- Data files (`.json`, `.csv`) if the preset is table-driven (screw sizes, board footprints, card sizes).

Write `meta.json` **last**, after the preset compiles: the build skips folders without it, so half-written presets never break the shelf.

## The script

- Use only what the engine implements: `src/engine/CORE-API.md` (units, params, geometry, patterns, sketches and the solver) and `src/engine/KERNEL-API.md` (parts, features, selectors, holes, lib, fit, inspect, print, rules, exports). Working examples of every feature are in `test/engine/scripts/` and the existing presets (`A-01-box`, `A-06-extrude-revolve`, `E-01-hook-search`). The language spec (`guides/jig-spec-README.md`) is the design; the API files say what exists today. If something you need is missing, design around it and say so in your report; do not leave errors in a preset.
- **Real dimensions.** Use real standards and real objects: ISO metric screws (M3 clearance 3.4 mm, M3 heat-set insert hole ≈ 4.0 mm × 5.7 mm), 1/4" pegboard on 1" centres, Raspberry Pi 4 mounting holes 58 × 49 mm M2.5, AA cell Ø14.5 × 50.5 mm, 608 bearing 22 × 8 mm, US/EU switch plates, 42 mm Gridfinity pitch, SD card 32 × 24 × 2.1 mm. Put the source in a comment.
- **Parameters.** `.params({…})` for every size that matters; `.expose([...], { labels, ranges })` for the 3–6 a person would change. Use expressions (`'w - 2 * wall'`) so changes propagate; use symbolic units for print-relative sizes (`lw(3)` walls, `layer(4)` floors).
- **Printable by default.** Return a print job when the object is meant to be printed: `j.print('<name>', { printer: j.printer('generic-fdm'), material: j.material('PLA' | 'PETG' | …), parts: [part] })`, oriented sensibly (auto, or an explicit direction with a comment saying why). Mind the FDM rules: overhangs within 45°, horizontal holes as teardrops (the kernel does this relative to the print direction), chamfers rather than fillets on bed edges, walls at least `lw(2)`, clearances from fit classes (`j.fit.hole/pin/gap`), no unsupported bridges over ~10 mm. `j.rules.fdm` should report nothing worse than an explained info.
- **Readable.** Feature ids that read like the design (`'body'`, `'pocket'`, `'drain'`, `'mount'`), selectors by feature (`j.feat('body').endFace()`) rather than `nth()`, a comment on each non-obvious choice.
- **Fast.** Under ~1.5 s to compile in Node (`tools/preset-check.mjs` prints the time). Keep pattern counts and fillet counts reasonable.

## The notes (workbench reading view)

Follow `guides/workbench/docs-and-notes.md`, `ui-copy.md` and `reading-markdown.md`. Shape:

1. `# Title`, then a lede paragraph: what it is, what it is for, the one idea it teaches.
2. A `> **Try it.**` callout with 2–4 `lab:` links: `lab:view/stage?view=front`, `lab:select/<persistent face name>`, `lab:param/<name>=<value>`, `lab:show/<view>` (trace, graph, ir, params, book), `lab:preset/<id>`, `lab:run`. Use real persistent names from a compile (`tools/preset-check.mjs` and the IR's L4 show them).
3. Two to four short sections (`## How it is built`, `## Printing it`, `## Changing it`…), each a few sentences, numbers with units and a space (`3.4 mm`, `42 min`), code spans for ids.
4. `## Where next` with links to related presets.

Plain, exact, measured, British spelling, sentence case, no exclamation marks, no emoji, no "please". Numbers come from the compile, not from guesses: run the check and copy the printed values.

## Check before you finish each preset

```
node tools/preset-check.mjs <ID>          # compiles with the real engine; must print ok with no errors
node tools/preset-shot.cjs <ID>           # renders test/presets/out/<ID>-…-axo.png (add --view=front etc.)
```

**Look at the PNG** (read the image file). It must read as the real object at the right proportions. If it looks wrong, fix the script. Do not run `node build.mjs` (other owners rebuild `dist/`); if `preset-shot` fails because `dist/worker.js` is mid-rebuild, wait a minute and retry.
