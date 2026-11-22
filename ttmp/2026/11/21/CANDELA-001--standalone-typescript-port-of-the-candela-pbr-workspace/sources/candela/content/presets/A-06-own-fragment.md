---
id: A-06
title: Writing a fragment
group: Algebra
about: A fragment of your own: .moss() grows green on upward-facing surfaces, with an around-advice that keeps baseColor plausible.
tries: Make the moss also prefer the shadowed side|Apply the fragment globally with candela.use
docs: architecture
focus: params
---
# Writing a fragment

```js
const moss = fragment('moss')
  .targets('material.pbr')
  .requires('baseColor', 'roughness')
  .params({ moss: param.float(0).range(0, 1) })
  .lower((m, f) => m.map('baseColor', c => fx.mix(c, mossColour, coverage(f.moss))) … )
```

- `.targets()` — which kinds it extends;
- `.params()` — new attributes, each a method and a slider;
- `.lower()` — at compile time, rewrite the material's own attributes;
- `.around('roughness', (next, self, r) => …)` — wrap an existing method (here: a mossy stone is never glossier than 0.3, whatever you pass).

Open the **Graph** to see the lowered expression: the moss mask sits under `baseColor` and `roughness`.
