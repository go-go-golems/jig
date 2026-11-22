---
id: M-14
title: Clear coat
group: Materials
about: A coat on top of anything: wood, rubber, a matte paint. The coat’s roughness changes the material more than the base does.
tries: Sweep the coat roughness|Put a coat on the gold sphere — is that physical?
docs: renderer
---
# Clear coat

`material.pbr().coat(1)` adds a thin dielectric layer above the base. In the algebra it is `layer(dielectric, base)`: the coat reflects a Fresnel-weighted part of the light, the rest reaches the base, and the light coming back out is attenuated by the coat again.

From left to right: a rough base (0.8) with **no coat**, with a **glossy coat**, with a **satin coat** (0.25), and with a **tinted coat** (amber, like varnish).
