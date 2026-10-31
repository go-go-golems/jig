# Toolbar

The row at the top of a view (46px minimum, wraps) that holds its controls, and the 30px hint bar that can close a view at the bottom.

## Use

Every view opens with `.toolbar`: filters first, then modes (Segmented, Toggle), then small buttons and menus, then a `.lbl` sentence that explains the view in ink-2 fs-xs ("Live: a change takes effect on the next step. Edit the code to change a default."). Gap 8px, padding 6px 12px, a hair rule below.

`.hint` sits at the bottom of a canvas view: a bold state word (`b`: "Click the stage", "Riding", "Replay") then the keys in ink-2, separated by " · ", truncated with an ellipsis rather than wrapped.

`.ntitle` in a toolbar names the document shown: the code in `.pcode` then the title in bold ("B-01 **Flatground** · Basics", "Chapter 47 **Drawing motion**").

## Markup

```html
<div class="toolbar">
  <input class="filter" placeholder="filter">
  <button class="tog" aria-pressed="false">Changed (0)</button>
  <span class="lbl">Live: a change takes effect on the next step. Edit the code to change a default.</span>
</div>
<div class="hint"><b>Click the stage</b><span>↑ push · ←→ carve · Space pop · J/L flick</span></div>
```

## Do and don't

- Do keep one toolbar per view; a second row of controls goes inside the view (a `.reshd`, a block header).
- Do explain the view in its `.lbl` in one or two plain sentences.
- Don't put the view's title in the toolbar; the tab already says it (documents are the exception: `.ntitle`).
