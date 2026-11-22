---
id: exposure
title: Exposure, metering and tone
group: The engine
about: EV100, saturation, the meter, false colour and tone maps
order: 21
---
# Exposure, metering and tone

The renderer computes **luminance in nit** ($\mathrm{cd/m^2}$): physical magnitudes, from a 60 W-equivalent bulb (800 lm) to the sun (≈ 100 000 lx). Turning that into a picture is a camera's job, and the workbench does it the way a camera does.

## Exposure value

$$EV_{100} = \log_2\frac{N^2}{t} - \log_2\frac{S}{100}$$

with $N$ the f-number, $t$ the shutter time and $S$ the ISO. *Sunny 16* — f/16, 1/125 s, ISO 100 — is $EV_{100} = 14.97$. A camera saturates at

$$L_{max} = 1.2 \cdot 2^{EV_{100}}$$

so the display maps $L / L_{max}$. Setting `.shutter()` or `.iso()` on a camera makes its exposure **physical**; `.exposure(ev)` fixes it; the default is **auto**.

## The meter

Auto exposure is a reflected-light meter: $EV_{100} = \log_2(L\,S/K)$, $K = 12.5$, applied to the **log-average** of the image. The average is taken over **blocks** first: a logarithm of noisy single-pixel estimates is biased low (Jensen's inequality), and spectral rendering is noisy at low sample counts. The centre counts double. Two refinements keep it from being fooled: blocks of **empty void** (more than ~13 stops below the bright end of the frame — no environment behind the scene) are left out of the average, and **highlight protection** keeps the 98th-percentile block within about 1.5 stops of saturation, raising the exposure by at most 4 stops — a lit stage in a dark hall should not blow out. Scenes that need a particular exposure set it: `.exposure(7)`, or physical settings with `.shutter()` and `.iso()`. Alt-click the viewport to meter any point.

## False colour

The *False colour* toggle shows exposure in **stops from middle grey** (the meter's target, $0.125/1.2$ of saturation): blues are under, greys are at middle grey, yellow is two to three stops over, red is clipping. It is how cinematographers judge exposure without trusting a monitor.

## Tone maps

The scene-referred image is mapped to the display by a tone map, then encoded as sRGB:

| Tone map | Character |
| --- | --- |
| AgX | gentle shoulder, hue-preserving desaturation of brights (the default) |
| ACES | the Narkowicz fit of the filmic ACES curve: contrasty, saturated |
| PBR Neutral | Khronos: base colours reproduce exactly up to ~0.8, then compress |
| Filmic | Hejl–Burgess-Dawson |
| Reinhard | $x/(1+x)$: no toe |
| Linear | clip at 1: shows how much a tone map hides |
