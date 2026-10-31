# Toggle

An on/off button with a 9px square mark: empty when off, filled ink when on. Also the inline checkbox label `.chk`.

## Use

`.tog` switches a mode of the view: Track, Follow, Freeze, Edit, "Changed (3)". The label names the mode, not the action ("Freeze", not "Freeze traces"). It is a button with `aria-pressed`. `.chk` is a native checkbox with its label, for options inside a toolbar row of a panel ("axonometric", "side + Track", "mean by x").

## Markup

```html
<button class="tog on" aria-pressed="true" title="Keep the rider in the middle">Follow</button>
<button class="tog" aria-pressed="false" title="Stop scrolling (the simulation keeps running)">Freeze</button>
<label class="chk"><input type="checkbox" checked> axonometric</label>
```

## States

- Off: ink-2 label, hollow mark, hair border. On: ink label, filled mark. Hover: ink border.
- `.chk` uses `accent-color: var(--ink)` so the native box is ink, never the browser's blue.

## Do and don't

- Do give every toggle a `title` saying what it does in a sentence.
- Don't use a toggle to run something once; that is a Button.
