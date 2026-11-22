---
id: D-03
title: Fragment contracts
group: Diagnostics
about: Fragments declare what they need and what they target; the builder checks both at the call, not at render time.
tries: Uncomment each line and read the error|Write a fragment that targets light.spot
docs: architecture
focus: console
---
# Fragment contracts

| line | code | why |
| --- | --- | --- |
| `material.metal('Fe').with(rust)` | **E130** | `rust` requires `baseColor`, `roughness`, `metallic`; a bare conductor has none |
| `light.spot().with(rust)` | **E131** | `rust` targets materials, not lights |
| `camera.thinLens().with(bokeh).blades(7)` | — | fine: `bokeh` targets cameras |

The working scene uses `rust` on a `material.pbr()` that has all three attributes.
