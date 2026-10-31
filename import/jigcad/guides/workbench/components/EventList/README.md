# EventList

Everything the program emitted, newest first: a monospaced log of time, type and a one-line summary, filtered by type chips and a search.

## Use

The Events view: a Toolbar with type chips (`.chips.evchips`; a chip is on when filled ink, its count in `small`), a 130px search (`.evsearch`) and Clear; then `.evlist` in the code face at 11.5px/1.55. Each `.ev` row is a grid: time with three decimals (right-aligned, tabular, ink-2), type (ink-2), and what happened (`.what`) with its source after " — " in ink-2. Click a row to open its data as `pre.src.evdetail` (four decimals) and mark it (`.sel`, 2px accent inset bar). Errors, bails and unlanded tricks are `.ev.bad` (type, source and summary in accent).

Summaries are written by the view: a trick as "kickflip · flip 0.99 shove 0.00 wrap 0.00 air 0.42 s"; anything else as its fields "key value" joined by " · ".

## Markup

```html
<div class="evlist">
  <div class="ev"><span class="t">2.525</span><span class="kd">pop</span><span class="what">snap 15 · jump 3<span class="s"> — pop/pop</span></span></div>
</div>
```

## Do and don't

- Do keep one line per event; details go in the expansion.
- Don't colour event types; only trouble is red.
