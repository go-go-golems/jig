---
id: L-10
title: A product in the studio
group: Light
about: A procedural studio: a dark sweep with two softboxes and a top light, reflected in glass and chrome.
tries: Rotate the studio environment to move the highlights|Swap the chrome for gold
docs: renderer
---
# A product in the studio

`light.env.studio()` is a procedural environment: a dark gradient dome with a key softbox, a fill and a top strip. Shiny products are mostly **reflections** — what you see on the chrome cap and in the glass is the studio itself, so moving the softboxes (`rotate`) moves every highlight.

The bottle is smooth glass (IOR 1.5, exact Fresnel, refraction), the liquid inside is an absorbing medium (Beer–Lambert: amber after 20 cm), the cap is chromium with its measured complex IOR.
