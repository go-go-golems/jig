# TilePicker

What an empty tile shows: a lead sentence and a grid of the closed views, each a bordered button with the view's title and what it is for.

## Use

When the last tab leaves a tile that is kept (the drop target of a split), the body shows `.picker`. Each button is the view's `title` in bold (fs-m) over its `about` in ink-2, lowercase: "the drafting sheet you skate on", "dataflow between systems by phase", "parameter sweeps, headless". The same titles and abouts fill the `+` menu of a strip ("Every view is open. Drag a tab here to move it." when none are closed).

## Markup

```html
<div class="picker">
  <p class="lead">An empty tile. Open a view:</p>
  <div class="pgrid">
    <button><b>Graph</b><small>dataflow between systems by phase</small></button>
  </div>
</div>
```

## Do and don't

- Do write each view's about as a lowercase phrase with no full stop, under 45 characters.
- Don't leave a tile blank: an empty state always says what to do next.
