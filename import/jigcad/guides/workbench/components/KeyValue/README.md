# KeyValue

A two-column list of measurements: the name small and grey on the left, the value bold and right-aligned with tabular figures.

## Use

`dl.kv` for live readouts in a side column or the inspector. Names are lowercase phrases ("deck height", "flip · shove · wrap", "ms / step", "min · max"); values carry their unit after a space ("4.29 m/s", "0.08 m"). Several related numbers share a row joined by " · ". A missing value is "—". `dl.kv.keys` turns the columns round for key help: the key in a `kbd` on the left in ink, the action on the right in ink-2, left-aligned.

## Markup

```html
<dl class="kv">
  <dt>speed</dt><dd>4.29 m/s</dd>
  <dt>flip · shove · wrap</dt><dd>-0.01 · 0.01 · 0.00</dd>
</dl>
<dl class="kv keys"><dt><kbd>Space</kbd></dt><dd>crouch; release to pop</dd></dl>
```

## Do and don't

- Do format numbers with the app's `fmt` (two decimals by default, three in the inspector) so columns line up.
- Don't put more than one unit in a value; split it into two rows.
