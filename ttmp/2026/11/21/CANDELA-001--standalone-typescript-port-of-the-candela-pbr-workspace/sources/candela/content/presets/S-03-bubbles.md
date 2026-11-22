---
id: S-03
title: Soap bubbles
group: Spectral
about: Free thin films of water, 250 to 900 nm thick: interference colours, traced at single wavelengths.
tries: Make one bubble very thin (< 100 nm) — why does it turn black?|Compare spectral and RGB rendering
docs: renderer
---
# Soap bubbles

A soap bubble is a **thin dielectric** — a film with two surfaces and no inside — whose thickness is comparable to the wavelength of light. Reflections from its two faces interfere:

- at 100 nm and below, the two reflections cancel (a phase flip at one face) and the film looks **black**;
- around 300–600 nm, first-order colours: yellow, magenta, blue;
- above 1000 nm, the orders overlap and the colours fade to white.

In the spectral engine, each path carries one wavelength, so the Airy reflectance is evaluated exactly per sample.
