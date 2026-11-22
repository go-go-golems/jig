---
id: A-01
title: mix: blending two BSDFs
group: Algebra
about: bsdf.mix(a, b, t) is a convex combination: valid for any t in [0, 1], and t can be a field or a slider.
tries: Drive the mix with a voronoi field instead of stripes|Explain how mix is sampled (stochastic selection)
docs: algebra, renderer
focus: params
---
# mix: blending two BSDFs

$$f = (1 - t)\, f_a + t\, f_b$$

Mixing is a **convex** combination, so if `a` and `b` conserve energy, so does the mix — for every `t` in [0, 1]. The kernel never evaluates both: it picks `a` with probability $1-t$ and `b` with probability $t$ (stochastic selection), which costs one lobe per bounce no matter how deep the tree is.

Left: `t` is a slider. Right: `t` is a field — stripes of gold on a blue ceramic.
