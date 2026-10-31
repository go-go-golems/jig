# Overlay menu

The stage toolbar's **Show ▾** menu: one row per overlay with a square tick box, its name and a one-line description.

**Provide** the workbench menu markup with the `overlays` class: `<div class="menu overlays"><button class="on"><span class="box on"></span><span class="t">Shadows</span><small>hatched sun shadows</small></button>…</div>`. `FormSkateStage.OVERLAYS` lists `[key, label, description]` in menu order.

- Box 9 px square: `ink-2` border when off, filled `ink` when on; the row's label bolds when on.
- The menu stays open while boxes are ticked (`data-keep` in the workbench).
- The button's count shows how many overlays are on (`Show 4 ▾`).
