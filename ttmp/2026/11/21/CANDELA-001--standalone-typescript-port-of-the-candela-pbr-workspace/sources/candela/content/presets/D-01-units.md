---
id: D-01
title: Units in practice
group: Diagnostics
about: Every quantity in this scene is a string a person would write — "1200 lm", "35 deg", "f/4", "5600 K" — parsed into typed values.
tries: Change "1200 lm" to "1200 lux" and read the error|What is the canonical unit of each slot?
docs: units, invariants
focus: console
---
# Units in practice

Every slot has a **dimension** (flux, intensity, illuminance, luminance, length, angle, temperature). Values can come as:

- typed quantities: `u.lm(1200)`, `u.deg(35)`, `u.mm(50)`;
- strings: `'1200 lm'`, `'35 deg'`, `'50 mm'`, `'f/4'`, `'5600 K'`;
- bare numbers, meaning the slot's canonical unit (metres, radians, lumens…).

A wrong dimension is **E120**, and the message names the conversion you probably meant. Open **Console → Explain** to see every value with its unit.
