# ParamRow

One live parameter: its label and short id, a slider over its range, the value with its unit, and a ↺ that appears once it differs from the default.

## Use

The Params view lists every `$.param` grouped by component (`.psub` sticky headers: "brake", "pop", "flick"). A change takes effect on the next step; the code holds the default. Rows are 30px minimum, in a 4-column grid: label, control, value, reset.

## Markup

```html
<div class="scroll paramlist">
  <div class="psub">pop</div>
  <div class="prow" data-param="pop/snap">
    <span class="pn" title="pop/snap">tail snap (nose-up spin the slam starts) <i>snap</i></span>
    <span class="pc"><input type="range" min="0" max="30" step="0.1" aria-label="tail snap"></span>
    <span class="pv">20 rad/s</span>
    <button class="tabact" title="default 15">↺</button>
  </div>
</div>
```

## States

- Changed: the ↺ button is enabled and shows; unchanged rows keep the empty, disabled button so columns do not shift.
- Highlighted (`.hl`, arrived through `lab:param` or the inspector): fill background and a 2px accent inset bar on the left.
- The value is bold ink with tabular figures: `+(+v).toFixed(4)` then the unit after a space ("0.11 m", "160 N", "15 rad/s").

## Do and don't

- Do write the label as the param's `label` in the code (lowercase, a phrase that says what it does) and the id's last segment in `<i>` (roman, ink-2).
- Don't show sliders without a unit when the param has one.
