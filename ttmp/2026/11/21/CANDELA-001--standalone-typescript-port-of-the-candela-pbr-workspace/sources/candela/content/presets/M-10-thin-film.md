---
id: M-10
title: Thin-film interference
group: Materials
about: Oil films, heat-tinted titanium, soap: a film a few hundred nanometres thick turns reflection into rainbows.
tries: Animate the film thickness with time|Which thickness gives the deep blue of heat-treated titanium?|Render spectrally and compare
docs: algebra, renderer
focus: params
---
# Thin-film interference

A film of thickness $d$ and index $n$ reflects light twice — from its top and its bottom. The two waves interfere with a phase difference

$$\delta = \frac{4\pi}{\lambda}\, n\, d \cos\theta_t$$

so some wavelengths reinforce and others cancel. Candela evaluates the **Airy summation** of all internal reflections (Belcour & Barla 2017 in the spectral engine; three wavelengths in RGB).

The row runs 100 → 800 nm on titanium; the front sphere is a soap bubble, a free film 400 nm thick.
