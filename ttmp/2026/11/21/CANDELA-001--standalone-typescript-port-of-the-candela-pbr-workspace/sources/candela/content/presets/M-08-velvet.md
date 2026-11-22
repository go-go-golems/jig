---
id: M-08
title: Velvet and sheen
group: Materials
about: A sheen lobe over a diffuse base: fibres catch light at grazing angles, so velvet glows at its silhouette.
tries: Compare the velvet with a plain Lambert of the same colour|Make the sheen roughness smaller
docs: renderer
---
# Velvet and sheen

Cloth has fibres standing up from the surface. Seen straight on, you look between them into the dark weave; at grazing angles you see their sides, lit. The **Charlie sheen** distribution (Estevez & Kulla 2017) models this:

$$D(\mathbf h) = \frac{(2 + 1/r)\,\sin^{1/r}\theta_h}{2\pi}$$

Left: velvet = `layer(sheen, lambert)`. Right: the same colour as a plain Lambertian surface. The difference is all at the silhouettes.
