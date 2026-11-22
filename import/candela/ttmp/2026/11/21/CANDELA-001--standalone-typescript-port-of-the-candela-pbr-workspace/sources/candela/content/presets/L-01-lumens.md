---
id: L-01
title: Lumens, candela, nits
group: Light
about: The same 1200 lm as a bare point, a focused spot and a panel: the geometry of an emitter decides its intensity.
tries: Meter the floor under each light and explain the readings|Make the panel twice as large with the same power — what happens to its luminance?|Convert 1200 lm to candela for each of the three
docs: units
---
# Lumens, candela, nits

Three lights, **the same flux** — 1200 lm each — and three very different pools of light. The flux is the same; how it is spread is not:

$$I_{point} = \frac{\Phi}{4\pi} = 95.5\ \mathrm{cd} \qquad I_{spot} = \frac{\Phi}{2\pi(1-\cos\theta)} = 3167\ \mathrm{cd}\ (\theta = 20°) \qquad L_{panel} = \frac{\Phi}{\pi A}$$

The point light spreads its 1200 lm over the whole sphere; the spot's reflector puts all of it into a 20° cone, so the same lumens give **33 times** the intensity; the panel is a Lambertian area light, whose *luminance* (what a camera sees when looking at it) is $\Phi/\pi A$ = 764 nit for 0.5 m².

> **Try it.** **Alt-click** the floor under each light to meter it (nit and EV). Then set the spot's `.powerMode('masked')`: a masked spot is a point light with a mask, so 1200 lm gives only 95.5 cd — the flux outside the cone is simply lost.

Lights take flux (`.power(u.lm)`), intensity (`.intensity(u.cd)`), illuminance (`.illuminance(u.lux)`, the sun) or luminance (`.luminance(u.nit)`, areas). Mixing them up is **E120**.
