# Segmented

A row of mutually exclusive choices sharing one hairline box; the chosen one is filled ink.

## Use

Pick one of two to six short options: the stage view (Axo, Front, Side, Plan), a trace window (2 s, 5 s, 10 s, 20 s), a replay speed (¼, ½, 1×). Labels are one or two words; put the full name in `title` (Axo → "Axonometric"). The group has `role="group"` and an `aria-label`; each button carries `aria-pressed`.

## Markup

```html
<div class="seg" role="group" aria-label="View">
  <button class="on" aria-pressed="true" title="Axonometric">Axo</button>
  <button aria-pressed="false" title="Front elevation">Front</button>
</div>
<div class="seg sm" role="group" aria-label="Window">…</div>
```

## Variants and states

- `.seg`: 30px high (control-h), fs-s, 11px side padding.
- `.seg.sm`: 24px high, fs-xs, 8px padding. Use it inside a view's toolbar.
- Selected: `.on` or `aria-pressed="true"`, ink fill and bg text. Unselected labels are ink-2 and turn ink on hover.
- `.seg.dis`: the whole group at 40% when the choice does not apply right now.

## Do and don't

- Do use it when every option fits on one line; use a `select` for longer lists (time scale 1×, 0.5×…).
- Don't use it for on/off: that is a Toggle.
