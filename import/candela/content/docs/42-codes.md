---
id: codes
title: Diagnostic codes (design)
group: Design
about: every code in the design, by severity
order: 42
---
# Appendix B — Diagnostic codes

| Code | Severity | Meaning | Raised at |
| --- | --- | --- | --- |
| E104 | error | unknown method or attribute (with did-you-mean) | build, live, agent |
| E120 | error | unit or dimension mismatch | build, trace, live |
| E121 | error | value outside its physical domain (roughness ∉ [0,1], …) | build |
| E123 | error | impossible optics (f-number < 0.5 in air) | build |
| E130 | error | a fragment's attribute contract is not met | compile |
| E140 | error | two fragments define the same method or attribute | build |
| E201 | error | symbolic value used as a JS number | trace |
| E202 | error | JS branch or comparison on a symbolic value | trace |
| E203 | error | param used in build-time JS arithmetic (use `.map`) | build |
| E162 | error | `export const animation` is not a function of time | build |
| E163 | error | `animation(0)` threw | build |
| W170 | warning | a pose names an id that no shape or group has | build |
| W310 | warning | colour space wrong for the role (linear quantity decoded as sRGB) | build |
| W330 | warning | albedo outside the plausible range [0.03, 0.90] | build / debug runtime |
| W335 | warning | partially metallic surface | compile |
| W340 | warning | IOR < 1 without an exterior medium | build |
| W351 | warning | fragment-defined rule (example: dust on emitter) | compile |
| W420 | warning | composed BSDF can exceed unit albedo | compile |
| W421 | warning | significant energy loss (missing multiple scattering) | test |
| I205 | info | instancing and constant-hoisting summary | compile |
| E450 | error | cannot bound a heterogeneous medium (majorant) | compile |
| I455 | info | approximation used by this engine's lowering | compile |
| I460 | info | biased estimator component | compile |
| W470 | warning | differentiating a visibility discontinuity without edge handling | optimise |
| I471 | info | host map differentiated by finite differences | optimise |
| W501 | warning | non-deterministic build lambda | build |
| I520 | info | host-animated motion blur is linear between frame keys | compile |
| W610 | warning | spectral data rendered by an RGB engine | compile |
| E710 | error | component has no lowering for this engine | compile |
| E720 | error | a render job was cancelled | output |
| E730 | error | video export unavailable (no WebCodecs, no encoder for the codec) or the encoder failed | output |
| E901 | error | agent action outside the session's allow-list | agent |
