# BigNumber

One headline number with a one-line caption under it; at most one per block.

## Use

`.bignum` shows the number a block is about: the score in the stage's side column. The number is bold, tabular, letter-spaced −0.01em (26px in a side column, 30px elsewhere); the caption is ui-small in ink-2 and says what else to compare it with ("best single trick 850").

## Markup

```html
<div class="bignum"><b>1,059</b><span>best single trick 850</span></div>
```

## Do and don't

- Do format with thousands separators (`toLocaleString()`).
- Don't open a view with a row of big numbers; the workbench shows numbers next to the thing they measure.
