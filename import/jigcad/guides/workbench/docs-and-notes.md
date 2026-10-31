# Writing docs and preset notes

Besides the book, the workbench carries two shorter kinds of writing: **preset notes**, the guide to one preset shown in the Notes tab, and **shelf docs**, one topic each in the Docs tab. Both are Markdown with frontmatter, rendered like the book (see *The Markdown the reading views render*).

## Preset notes

A preset is `content/presets/<id>.md` plus an optional folder `content/presets/<id>/` holding files that replace the base library's (`main.js`, `lab/chrono.js`) or patch it (`main.js.patch`: blocks of `//@@ find`, `//@@ replace`, `//@@ end`, each of which must match once).

```markdown
---
id: B-01
title: Flatground
group: Basics
about: The whole game, as the library ships it: a lot, a funbox, a board, a rider, fifteen tricks.
tries: Explain how a kickflip happens, from the key press to the trick event | Add a new trick to the recognizer and test it
pins: recognizer/height, recognizer/flipTurns, recognizer/shoveTurns
docs: workbench-tour, rigid-bodies, quaternions
overlays: shadows, trail, annotations, grid
view: axo
---
```

| key | is |
|---|---|
| `id` | group letter and number: B Basics, P Physics, T Tricks, M Mechanisms, G Game feel, R Recognition, E Experiments, D Drafting (U for a viewer's own) |
| `title` | the preset's name in the menu and the notes toolbar |
| `group` | Basics, Physics, Tricks, Mechanisms, Game feel, Recognition, Experiments, Drafting |
| `about` | one sentence, shown under the title in the preset menu and in related lists |
| `tries` | questions for the agent, separated by `\|`, offered as buttons in an empty thread |
| `pins` | traces pinned when the preset loads |
| `docs` | shelf docs listed under "Further reading on the shelf" |
| `overlays`, `view`, `track`, `zoom`, `speed`, `chains`, `order` | the stage's starting settings |

The body follows one pattern. A `#` title, then a lede that says what is on the screen and what the preset is for, then a **Try it** as early as possible so the reader acts before reading on, then `##` sections that each explain one mechanism with a short code excerpt or formula, a Try it where it can be seen, and an **Exercise** at the end. Notes are shorter than chapters (500 to 1,000 words) and assume the reader has the workbench open: link generously with lab: links.

## Shelf docs

`content/docs/<nn>-<slug>.md`, ordered by `order`:

```markdown
---
id: springs
title: Springs, damping and critical damping
group: Control
about: The damped oscillator, ζ and ωₙ, overshoot, and the exact half-life springs used for smooth animation.
order: 24
---
```

Groups on the shelf: Start here, Maths, Mechanics, Control, Contact, The board, Computation, Drawing, Method. A doc covers one topic: it opens by saying what it covers and where the library uses it ("Springs are everywhere in the library: contact forces, the rider's legs, the foot guides, the camera…"), develops it in five to eight `##` sections with the library's own numbers, and often ends with its limits ("When a spring is the wrong tool"). Point to the book chapter that goes deeper with `[Chapter 9](lab:book?ch=9)`.

## Voice

The same as the book's (see *Writing a book section*): plain, exact, the program's own names, real numbers, British spelling, no analogies. Notes and docs were written before the book's checker and use em dashes; new writing should follow the book's rule (a colon, a comma, parentheses or a new sentence) so text can move between notes, docs and chapters. The book checker does not run on notes and docs, but `test/links.js` checks their lab: links.
