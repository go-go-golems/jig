---
id: E-06
title: A custom pass
group: Engines
about: pass.define: a display-stage kernel traced from JS — a duotone posteriser with two colours and a level count as sliders.
tries: Add a third tone|Make it an HDR-stage pass that runs before tone mapping
docs: architecture
focus: params
---
# A custom pass

```js
const duotone = pass.define('duotone', {
  params: { levels: param.float(5).range(2, 12), dark: param.color(…), light: param.color(…) },
  stage: 'display',
  kernel: ({ color }, P) => fx.mix(P.dark, P.light, color.luminance().mul(P.levels).floor().div(P.levels)),
});
```

A pass sees the pixel's `color` (HDR or display-referred, by stage), `uv`, the `albedo` and `normal` guides and the `luminance`. Its params become sliders that don't restart the render — passes run after accumulation.
