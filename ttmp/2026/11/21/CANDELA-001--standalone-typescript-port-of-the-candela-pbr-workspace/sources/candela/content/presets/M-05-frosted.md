---
id: M-05
title: Frosted glass
group: Materials
about: Rough dielectric transmission: the same glass at roughness 0, 0.1, 0.25 and 0.5 in front of a striped panel.
tries: Explain why frosted glass blurs distant things more than near ones|Tint the frosted panes
docs: renderer
---
# Frosted glass

A rough dielectric scatters transmitted light into a lobe around the refracted direction — the microfacet model applied to refraction (Walter et al. 2007). Things right behind the pane stay sharp; things far behind blur, because the lobe's angular width is fixed and the footprint grows with distance.

Each pane is a thin box of glass; the stripes are 0.6 m behind it.
