---
id: L-02
title: Sunny 16
group: Light
about: A camera with real settings under a real sun: f/16, 1/125 s, ISO 100 is EV 15, and the scene is exposed correctly.
tries: What is the EV100 of this camera? Check it against the title block|Set the shutter to 1/30 s — by how many stops does the image brighten?|Turn on False colour and read the exposure
docs: sensor, exposure
---
# Sunny 16

The old rule: in bright sun, at **f/16**, set the shutter to **1/ISO**. Here the camera has no automatic exposure — it is set like a real one, and the exposure follows from the settings:

$$EV_{100} = \log_2\frac{N^2}{t} - \log_2\frac{S}{100} = \log_2(16^2 \cdot 125) = 14.97$$

The sun is a real one too: 100 000 lx at normal incidence, with a physical sky. A camera saturates at $L_{max} = 1.2 \cdot 2^{EV} \approx 38\,400$ nit, and the display maps $L/L_{max}$ through the tone map.

> **Try it.** Turn on **False colour** in the viewport: the grey card sits near middle grey, the white card a couple of stops over, the sky's brightest part near clipping. Then move the **Shutter** param: every halving of the time is one stop more light.
