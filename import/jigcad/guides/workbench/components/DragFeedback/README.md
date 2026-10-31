# DragFeedback

While a tab is dragged: a label that follows the pointer, and a red-washed box (or a 2px red marker in a tab strip) where it will land.

## Use

`.drag-ghost` follows the pointer 12px right and 10px down: ink fill, bg text, the view's title in bold and the target in small text ("split right", "add as a tab", "move here", or "drop on a tile" when over nothing). `.drop-hint` covers the half or whole tile the drop would fill: sel wash, 2px accent border, its label in a small accent-bordered box. Over a tab strip it becomes `.drop-hint.marker`, a 2px accent bar between tabs. Both are `position: fixed` and ignore the pointer.

Dropping within 22% of a tile's edge splits it on that side; the middle adds the view as a tab. Gutters drag with `body.resizing-x` / `.resizing-y` set so the cursor holds while the pointer crosses canvases.

## Markup

```html
<div class="drop-hint" style="left:520px;top:92px;width:460px;height:500px"><span>split right</span></div>
<div class="drag-ghost" style="left:812px;top:240px">Traces <small>split right</small></div>
```

## Do and don't

- Do say the result of the drop in words; colour alone does not say what happens.
- Don't animate more than the 0.08s slide of the hint between targets.
