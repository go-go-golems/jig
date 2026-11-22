---
id: F-06
title: Build time vs. run time
group: Fields
about: JS loops run once and unroll; fields run per pixel. The same ripple built both ways — and the difference in the generated code.
tries: Change OCTAVES to 8 and look at the shader size|Try an if-statement on p.P.y and read the error
docs: architecture, grammar
---
# Build time vs. run time

Two lambdas look alike but live in different worlds:

```js
for (let k = 0; k < OCTAVES; k++) h = h.add(p.P.xz.length().mul(2 ** k * 8).sin().mul(0.5 ** k));
```

The `for` loop and `2 ** k` are **JavaScript**: they run once, while the lambda is traced, and leave behind an unrolled sum of four sines. `p.P.xz.length()` is a **field**: it becomes WGSL and runs for every shading point.

JS can't branch on a field, because when the lambda runs there is no value yet — only a symbol. `if (p.P.y > 0)` is **E202**, with the fix in the message: `fx.select(p.P.y.gt(0), a, b)`.

> **Try it.** Set `OCTAVES` to 8, run, and compare the **Shader** view: twice the terms. Then uncomment the last line.
