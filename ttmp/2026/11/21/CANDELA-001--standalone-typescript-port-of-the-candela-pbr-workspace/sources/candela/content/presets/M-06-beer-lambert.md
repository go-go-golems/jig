---
id: M-06
title: Coloured glass: Beer–Lambert
group: Materials
about: The same absorbing glass in slabs 1, 2, 4 and 8 cm thick: colour deepens with distance travelled.
tries: Why does the thick slab look a different hue, not just darker?|Fill a glass with red wine
docs: media
---
# Coloured glass: Beer–Lambert

Coloured glass is clear glass with an **absorbing interior medium**. Light that travels a distance $d$ inside keeps a fraction

$$T(d) = e^{-\sigma_a d}$$

per wavelength. `material.glass({ absorb: '#6cc890', distance: u.cm(2) })` means: *this* is the colour after 2 cm. Thicker slabs go deeper, and since red is absorbed faster than green here, the hue shifts too — not just the brightness.
