# Button

A square, hairline-bordered text button: the workbench's one kind of command button.

## Use

Use `.btn` for commands in toolbars, menus' footers and blocks. Label it with a verb or the thing it does, in sentence case: "Run", "Square up", "Clear", "Reset all", "Stop", "Save". A command that opens a menu ends with ` ▾` ("Files ▾", "Export ▾"). Put the keyboard shortcut in a `kbd` inside the button, hidden on narrow screens with `.long`.

## Markup

```html
<button class="btn">Square up</button>
<button class="btn primary">Run<span class="long"> <kbd>⌘↵</kbd></span></button>
<button class="btn sm">Clear</button>
<button class="btn sm primary">Run</button>
<button class="btn sm" disabled>Run</button>
<button class="btn danger">Delete</button>
<button class="btn sm">recognizer/flipTurns <small>number</small></button>
```

## Variants and states

- **default**: hair border, no fill; hover turns the border ink.
- **`.primary`** (and `.on`): ink fill, bg text. Use it for the one action the view is waiting for: Run turns primary only when the code has unsaved edits (`host.isDirty()`), an experiment's Run is primary. At most one primary in a view.
- **`.sm`**: 3px 8px padding, fs-xs. The size for toolbars inside a view (Clear, Reset all, Square up, Show ▾, Order ▾, Clip ▾, Export ▾).
- **`.danger`**: accent text and border. Only for an action that throws something away; prefer a `.danger` item inside a menu (Delete skate/grind.js) over a red button on the surface.
- **`:disabled`**: 40% opacity, hair border. Disable instead of hiding when the reason is temporary (another experiment is running).

## Do and don't

- Do keep corners square (`border-radius: 0` is in the rule) and the border 1 px.
- Do let a button grow from its label; never set a fixed width.
- Don't colour a button for emphasis. Red means trouble.
- Don't put an icon glyph in a text button except the trailing ▾ and the leading ■ of "■ Live".
