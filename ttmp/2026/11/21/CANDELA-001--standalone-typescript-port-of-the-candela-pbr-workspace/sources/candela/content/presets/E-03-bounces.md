---
id: E-03
title: How many bounces?
group: Engines
about: Max depth from 1 to 12 in a white room: direct light only, then each bounce adds less — and the room fills with colour bleeding.
tries: What fraction of the light arrives after the 3rd bounce?|Turn off Russian roulette
docs: monte-carlo
focus: params
---
# How many bounces?

With max depth 1 you see only direct light — shadows are black. Each extra bounce adds the light reflected once more, multiplied by the albedo (≈ 0.7 here), so the series converges like $\sum \rho^k$: a white room needs many bounces, a dark one few.

**Russian roulette** makes deep paths cheap without bias: after a few bounces, a path continues with probability $q$ and its weight is divided by $q$.

Watch the red and green walls tint the floor and the white blocks — colour bleeding is an indirect effect.
