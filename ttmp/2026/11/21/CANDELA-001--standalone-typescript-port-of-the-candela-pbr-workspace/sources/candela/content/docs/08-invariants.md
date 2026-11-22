---
id: invariants
title: Invariants the API enforces
group: Foundations
about: what is checked, where, and with which code
order: 8
---
# Invariants the API enforces

| Invariant | Where it is checked | Code |
| --- | --- | --- |
| Units and dimensions match (`lm` is not `cd`) | build: proxy argument check | E120 |
| Reflectance within `[0, 1]`; plausible within `[0.03, 0.90]` | build for constants, debug runtime for fields | E121, W330 |
| Composed BSDFs conserve energy | compile: albedo tables or Monte Carlo | W420 |
| Lens f-number ≥ 0.5 (the limit in air) | build | E123 |
| No JS arithmetic or branching on symbolic values | trace: `Symbol.toPrimitive` trap | E201, E202 |
| Build lambdas are deterministic | build: `Math.random` interception | W501 |
| Spectral data rendered by an RGB engine | compile | W610 |
| Every component has a lowering for the chosen backend | compile | E710 |

---
