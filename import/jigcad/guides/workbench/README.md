Form Skate Workbench is an IDE for one program, a skateboard game built on `@form/core`: code, notes, docs, a textbook, a coding agent and a drafting-sheet stage share one window of tiled views, and every view is there to read or change the running program. This system is the workbench's look and its writing: the Kiln style of the shell, panels and reading views (Swiss: white ground, one ink, Arial in two weights, 1 px rules, red only for trouble and selection), and how to write its interface copy, notes, docs and book chapters.

Two neighbouring systems cover the rest. **Form Skate Agent** (https://claude.ai/artifact/4KJ4g867ubqBbVszAeqXWM) is the agent panel: how the agent works, its chat, steps and threads. **Form Skate Stage** (https://claude.ai/artifact/J3P5XmY4B7uyZJZzgLaZYy) is the stage: the 2.5D drafting look, the camera, line weights and the overlays drawn on the canvas (chips, trick toast, fail banner). A new panel uses this system; anything drawn on the stage uses the Stage system.

## Using this system

- **Tokens**: colours by their Kiln names (`--bg`, `--ink`, `--ink-2`, `--hair`, `--rule`, `--fill`, `--code-bg`, `--accent`, `--sel`, `--tok-*`), font sizes `--fs-xs` to `--fs-xl`, families `--font-ui`, `--font-display`, `--font-code`. In the app's own stylesheet the families are `--mono` (which is Arial), `--display` and `--code`.
- **Components** are CSS classes on plain markup, in `components/bundle.css` (the rules copied from `app/kiln.css` and `app/skate.css`). There is no script bundle: the app renders the same markup from React (`app/ui/*.jsx`), and any markup with these classes looks the same. Each component's README gives the markup to write.
- **Fonts**: nothing to load. The interface is Arial ("Helvetica Neue", Helvetica, sans-serif); code is the system monospace (ui-monospace, Menlo, Consolas). IBM Plex Mono belongs to the stage only.
- **Themes**: light is the default and dark mirrors it; the viewer's choice cycles system → light → dark from the header and sets `data-theme` on the root. Style through tokens only; no rule names a colour.
- **Where it lives in the code**: `app/kiln.css` and `app/skate.css` (styles), `app/ui/app.jsx` (header, layouts), `dock.jsx` (tiles), `common.jsx` (Seg, Tog, Menu), `code.jsx`, `panels.jsx`, `notes.jsx`, `book.jsx`, `app/markdown.js` (reading views), `app/highlight.js` (code colours), `app/bookexport.js` (HTML, EPUB, Markdown export).

## Content fundamentals

The workbench talks like a lab notebook: plain, exact, measured. The full guide is the section *Writing interface copy*; the rules most often needed:

- **Name things by what they are in the program**: "systems", "signals", "states", "params", "pin trace", "hot edit", "fresh world". Use the program's ids as written (`pop/snap`, `skater/stance`) in the code face.
- **Sentence case** for buttons and menu titles ("Export project", "Square up"); **lowercase** for small descriptions, placeholders and abouts ("the drafting sheet you skate on", "search the shelf"). View names are one capitalised word: Notes, Docs, Book, Code, Agent, Reference, Stage, Graph, IR, Traces, Events, Params, Experiments.
- **Numbers with units**, a space between: "4.29 m/s", "0.08 m", "15 rad/s", "160 N", "1/120 s". Times in seconds with two decimals on the clock and three in logs. Join related facts with " · " ("16 systems · 15 signals · 42 states"), multiply with × ("combo ×2", "1×").
- **Say what happens and what to do next**: "No traces pinned. Type above to add one, or click *pin trace* in the inspector." Errors name the thing that failed, the place and the fix: "pop/pop stopped at 2.53 s: … Fix it and press Run (the world resumes), or Reset."
- **British spelling** (centre, behaviour, colour). No exclamation marks, no emoji, no "please", no jokes.
- The book has stricter rules (no em dashes, a banned-word list, numbers only from measurement): see *Writing a book section*.

## Visual foundations

- **Ground and ink.** Every surface is `bg`; text and marks are `ink`; secondary text is `ink-2`. There are no tinted panels and no cards: a region is separated by a 1 px `hair` rule, rows by a `rule` line. `fill` appears only on hover, on inline code chips and in a plain callout. Code sits on `code-bg`.
- **Lines are the structure.** 1 px everywhere (`hair` for borders and tile edges, `rule` between rows, `ink` for emphasis: a menu's border, the rule above a doc section, the params panel's top). 2 px only for marks of state (a selected row's inset bar, a callout's rule, focus). 3 px once: above a part title in the Book.
- **Two weights.** 400 and 700, nothing else. Bold marks the active tab, a value, a title, a defined term.
- **One red.** `accent` means trouble or selection: errors, bails, the stopped clock, the selected row's bar, the selected graph node, a Try it callout, the ▸ after a lab: link, the chapter label, the caret. Never decoration, never a category colour. `sel` is its wash. Success is not coloured.
- **Square.** `border-radius: 0` on every control, menu, tile, toast and callout. The only round things are the radio mark in menus and the signals group in the graph.
- **Dense and quiet.** Base text 12px at line height 1.45, controls 30px high, toolbars 46px, the header 52px. Paddings are small fixed values (see Spacing: 4, 6, 8, 10, 12, 14, 16px). No shadows anywhere in the UI (one exception: the Book's contents drawer in a narrow tile).
- **Numbers line up.** Use `font-variant-numeric: tabular-nums` wherever digits change or stack: clocks, pills, values, tables, readouts.
- **Data without hue.** Charts and plots are ink on the ground with ink-2 axes in 9.5px and rule grid lines. Tell series apart by dash (solid, 4 3, 1 2) and mark shape (circle, square, diamond, cross, triangle), never by colour; accent marks only the selected series or a failure.
- **Focus.** `:focus-visible` draws a 2px ink outline offset 1px; inputs show focus by turning their border ink.
- **Motion.** Almost none: a busy indicator blinks (0.8 s, two steps), the drop hint slides 0.08 s between targets, the Book's contents drawer slides 0.18 s (off under `prefers-reduced-motion`). Nothing fades in.
- **Dark theme.** The same design with bg `#1a1a1a`, ink `#f2f2f2`, ink-2 `#9a9a9a` and a lighter red `#ff3b4a`; washes are stronger (sel 16%). Comments and punctuation in code get darker, not lighter, so they still recede.

## Layout

- **Header bar** (HeaderBar) across the top; under it the **dock**: tiles of tabbed views split by 1 px gutters (DockTile). Seven layouts ship ("Code beside the stage", "Stage first", "The program: code, graph, IR", "Reading the notes", "Experiments and traces", "Reading the book", "Everything in one tile"); people drag tabs to make their own, kept per browser. See *Layouts and the dock*.
- **A view** is `.tabbody`: a Toolbar at the top, the body (a `.scroll` list, a document, a canvas, a diagram), optionally a 288px side column of Blocks on the right (`aside.side`), optionally a 30px hint bar at the bottom.
- **Responsive by tile, not window.** A tile body is a size container: under 640px of tile width a view stacks its side column under its body; the Book and Docs fold their left column away under 700 and 620px. Under 640px of window the dock becomes one tile and the header drops pills and labels.
- **Reading width.** Documents keep a 76ch measure (74ch in the Book) at 18px 22px padding, however wide the tile.

## Iconography

There is no icon set. The workbench uses text glyphs in the UI font: ▶ ❚❚ ⏭ ⏮ ↺ (run controls), ‹ › (previous, next), × (close, unpin), + (open a view), ▾ (opens a menu), ▸ (after a lab: link), • (unsaved file), ● (recording), ▦ (layouts), and the declaration glyphs of the code gutter: ■ system, λ signal, ○ state, ◇ param, ◎ watch, ▢ view, △ thing. The theme switch is the one drawing: a 16px inline SVG (sun, moon, half disc) stroked in `currentColor` at 1.4, because those glyphs are missing from many fonts. Check marks are 9px squares (`.tog::before`, `.box`), filled ink when on. No emoji, no icon fonts, no logo: the name set in bold type is the mark. The Screens group holds screenshots of the real workbench for reference.

## States

| state | how it looks |
|---|---|
| hover | a control's hair border turns ink; a row gets `fill` |
| selected choice | ink fill with bg text (segment, on button, event chip) |
| selected row | a 2px accent inset bar on the left (shelf entry, chapter, event, parameter, experiment), bold title |
| unsaved | " •" after a file, "edited" after the preset, Run turns primary |
| busy | a blinking 6px square after the pill's value; a Meter with Stop |
| error | accent text and border; the line washed `sel`; the diagnostics list under an accent rule; a red toast |
| disabled | 40% opacity (45% in menus), no hover |
| empty | an ink-2 sentence that says what to do |

See *States, errors and feedback* for the wording.

## Building a new panel

1. Register the view with a one-word title and a lowercase about (`app/ui/app.jsx` `views`), and render `<div class="tabbody col">`.
2. Open with `<div class="toolbar">`: a `.filter` if the view lists things, Segmented and Toggle controls for its modes, `.btn.sm` commands, and a `.lbl` sentence that says what the view shows.
3. Put the content in `<div class="scroll">`: rows with `rule` lines between them (`.rt` tables, `.ev`-style grids in the code face for logs), or a `.doc` for prose.
4. For details of a selection add `<aside class="side">` with Blocks: an h2 noun, a `.sub`, a `.note`, a `dl.kv`, `.actions` links. Use `.nid` for program ids so they select in the graph.
5. Use `.empty.padded` for the empty state, `.fail` for a failure inside the view, `host.toast` for a passing confirmation.
6. Colours only from tokens; the red only for errors and the selection; numbers tabular with units.
7. If it draws (a canvas plot), read `--ink`, `--ink-2`, `--rule` and `--accent` from `getComputedStyle` at draw time, as Traces does, so it follows the theme.
