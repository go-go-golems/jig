---
id: D-02
title: Build time, run time: the errors
group: Diagnostics
about: Each commented line is a classic mistake at the boundary between JavaScript and the GPU. Uncomment one, run, and read the message.
tries: Uncomment the E203 line and fix it with .map|Why is Math.random in a group lambda only a warning?
docs: architecture, invariants
focus: console
---
# Build time, run time: the errors

| line | code | what happened |
| --- | --- | --- |
| `p.P.y > 0 ? a : b` | **E202** | JS branching on a field — there is no value yet, only a symbol; use `fx.select(p.P.y.gt(0), a, b)` |
| `p.uv.x * 10` | **E201** | JS arithmetic on a field; use `.mul(10)` |
| `P.gloss * 2` | **E203** | JS arithmetic on a param — its value can change after the build; use `P.gloss.mul(2)` (a field) or `P.gloss.map(v => v * 2)` (a host value) |
| `p.wo` in a heightfield | **E207** | there is no view direction when the geometry is built |
| `fx.host(…)` in a material | **E710** | a host function cannot run on the GPU |

The active line uses `Math.random()` inside a group's build lambda: it works, but the scene changes on every build — **W501** suggests the seeded `rng` the lambda already receives.
