---
id: M-03
title: Fresnel at grazing angles
group: Materials
about: A black lacquered floor: 4 % reflection looking down, nearly a mirror at the horizon.
tries: Change the IOR to 1.33 and to 2.4: how does F0 change?|Make the floor rough — where does the reflection go?
docs: renderer
focus: params
---
# Fresnel at grazing angles

Every dielectric reflects more as light grazes it. At normal incidence the reflectance is

$$F_0 = \left(\frac{n - 1}{n + 1}\right)^2 = 0.04 \quad (n = 1.5)$$

and it rises toward 1 at 90°. The floor here is a smooth dielectric over a black base: near the camera you see 4 % of the columns; far away, the reflection is almost as bright as the columns themselves.

Candela evaluates the **exact** unpolarised Fresnel equations for dielectrics, not Schlick's approximation.
