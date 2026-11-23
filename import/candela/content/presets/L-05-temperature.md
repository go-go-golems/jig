---
id: L-05
title: Colour temperature
group: Light
about: Seven bulbs from candle to overcast sky: Planck’s law, normalised to the same luminous flux.
tries: Which bulb is closest to D65 white?|Render this spectrally and compare|Explain why 1800 K looks orange and 12000 K blue
docs: units
---
# Colour temperature

Each bulb emits 600 lm with a **blackbody** spectrum at its temperature — Planck's law, integrated against the CIE colour-matching functions to get its chromaticity, then normalised so every bulb has the same luminance. Only the colour differs:

$$B(\lambda, T) = \frac{2hc^2}{\lambda^5}\,\frac{1}{e^{hc/\lambda k T} - 1}$$

| T | source |
| --- | --- |
| 1800 K | candle, sodium-ish |
| 2700 K | incandescent bulb |
| 3500 K | halogen, warm LED |
| 5000 K | horizon daylight |
| 6500 K | overcast daylight (≈ D65 white) |
| 9000 K, 12000 K | blue sky in shade |

The white balance of the display is D65, so 6500 K looks neutral.
