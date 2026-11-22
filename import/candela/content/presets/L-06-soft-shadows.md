---
id: L-06
title: Size makes softness
group: Light
about: Three area lights with the same power and three sizes: the penumbra is the light’s size seen from the shadow.
tries: Make the small light smaller still and watch the noise and the shadow|Why does the big panel give less contrast?
docs: monte-carlo
---
# Size makes softness

A shadow's soft edge — the **penumbra** — is where part of the light is hidden. Its width grows with the light's angular size seen from the floor: a source of size $s$ at height $d$ above an occluder of height $h$ gives a penumbra of about $s\,h/(d - h)$.

All three panels emit 1500 lm. The small one has a high luminance ($L = \Phi/\pi A$) and gives crisp shadows and bright highlights; the large one is dim to look at and wraps light around the objects.

Sampling matters here: each panel is sampled directly (next-event estimation) and by the BSDF, and multiple importance sampling weights the two. Turn **Denoise** off to see the raw noise: small lights are easy for light sampling, large ones for BSDF sampling.
