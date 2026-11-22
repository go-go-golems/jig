---
id: C-01
title: Depth of field
group: Camera
about: Aperture and focus distance as sliders: a thin lens blurs everything off the focal plane by its circle of confusion.
tries: Focus on the farthest pawn|What f-number keeps all five sharp?|Compute the hyperfocal distance for this lens
docs: sensor
focus: params
---
# Depth of field

A thin lens of focal length $f$ at f-number $N$ has an aperture of diameter $f/N$. A point at distance $d$ when the lens is focused at $s$ images to a disc — the **circle of confusion** — of diameter

$$c = \frac{f^2}{N}\,\frac{|d - s|}{d\,(s - f)}$$

The camera samples a point on the aperture for every path, aimed at the focal plane, so the blur is physically correct: foreground and background blur differently, highlights become discs (see **Bokeh**).

Both sliders are live: moving them updates two uniforms, no rebuild.
