# TextLink

Underlined text that does something: a quiet command, a source location, a node id, a heading that pins.

## Use

- **`.link`**: small (fs-xs), ink-2, underlined; a secondary command in a footer, an actions row or a toolbar: "revert notes", "revert file", "pin trace", "open in Params". `.link.strong` is ink and bold for the primary location ("skate/motors.js:153"); `.link.bad` is accent.
- **`.linkhd`**: a button that looks like the heading or title inside it (a block's h2, an experiment's name, a trace id). Clicking selects or pins.
- **`.nid`**: an id in a list or in IR text: ink, underlined with a hair line that turns ink on hover. `.on` is the selected id (accent, bold), `.dim` an id that cannot be followed (ink-2, no underline).

Links inside Markdown (`a.lablink`, with a red underline and ▸) are part of the reading views: see Doc.

## Markup

```html
<div class="actions"><button class="link strong">skate/motors.js:153</button> <button class="link">tick at 159</button></div>
<button class="linkhd"><h2>flipTurns</h2></button>
<div class="refs"><button class="nid">intent/pop</button><button class="nid on">pop/snap</button><button class="nid dim">board/deck.forces (additive)</button></div>
```

## Do and don't

- Do write link text in lowercase unless it is a name or a path.
- Don't use `.link` for navigation between views; views are reached through `host.focus` or a lab: link.
