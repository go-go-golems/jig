---
id: L-08
title: The inverse-square law
group: Light
about: Five cards at 1, 2, 3, 4 and 5 m, each facing a bare bulb: illuminance falls as 1/d², and the meter proves it.
tries: Meter each card and check the ratios|Replace the bulb with a long panel — does 1/d² still hold up close?
docs: units
---
# The inverse-square law

A point source of intensity $I$ lights a surface facing it, at distance $d$, with illuminance

$$E = \frac{I}{d^2}$$

The bulb is 1500 lm, so $I = 1500/4\pi \approx 119$ cd: 119 lx at 1 m, 30 at 2 m, 13 at 3 m, 7.5 at 4 m, 4.8 at 5 m. Each card is turned to face the bulb (`.facing(…)`), so the light arrives at normal incidence.

> **Try it.** **Alt-click** each card: a matte white of albedo 0.8 has luminance $L = \rho E/\pi$ — about 30, 7.6, 3.4, 1.9 and 1.2 nit. The exposure is fixed (`.exposure(6)`), so the falloff is not hidden by the meter.

An extended source breaks the law up close: within a few times its own size, a panel behaves more like a plane than a point.
