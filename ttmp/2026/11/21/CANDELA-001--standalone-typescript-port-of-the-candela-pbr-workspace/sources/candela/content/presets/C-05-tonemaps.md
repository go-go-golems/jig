---
id: C-05
title: Tone mapping
group: Camera
about: Saturated lights far brighter than white: AgX desaturates gracefully, ACES shifts hues, Reinhard and Linear clip differently.
tries: Compare blue neon under AgX and ACES|Which tone map keeps the sky and the lamp both readable?
docs: exposure
focus: params
---
# Tone mapping

The renderer computes **luminance in nits**. A display shows at most a few hundred. A tone map compresses the range — and its choices matter most for bright, saturated colours:

| | |
| --- | --- |
| **AgX** | desaturates toward white as things brighten, like film; hues stay put |
| **ACES** | filmic contrast, but strong blues shift toward purple |
| **PBR Neutral** | keeps base colours accurate up to the shoulder |
| **Filmic** | a classic S-curve |
| **Reinhard** | $L/(1+L)$ per channel: saturated highlights stay saturated |
| **Linear** | clips at white |

The tone map is a param here (it rebuilds the display pass); the viewport toolbar also has an override.
