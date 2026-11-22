---
id: M-09
title: Brushed metal: anisotropy
group: Materials
about: Two roughnesses, one per tangent direction: highlights stretch across the brushing.
tries: Swap the roughness pair and see the highlight rotate|Make an anisotropic copper kettle
docs: renderer
focus: params
---
# Brushed metal: anisotropy

Brushing leaves parallel grooves. Along the grooves the surface is smooth; across them it is rough. GGX handles this with two widths, $\alpha_x$ and $\alpha_y$, along the surface tangents:

```js
bsdf.conductor({ ior: 'Al', roughness: [0.08, 0.45] })
```

The highlight stretches **perpendicular** to the grooves. Sampling still uses the visible-normal distribution (VNDF), so the noise stays low.
