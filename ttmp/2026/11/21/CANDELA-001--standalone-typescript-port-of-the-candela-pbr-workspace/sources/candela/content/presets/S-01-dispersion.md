---
id: S-01
title: Dispersion: hero wavelengths
group: Spectral
about: Dense flint glass in front of a striped light: in the spectral engine every edge splits into a rainbow; in RGB it cannot.
tries: Switch the spectral toggle off and read W610|Swap SF11 for fused silica — how much weaker is the fringing?|What is the Abbe number of each glass?
docs: renderer, algebra
focus: params
---
# Dispersion: hero wavelengths

Glass bends blue more than red. A **Sellmeier** equation gives the index per wavelength:

$$n^2(\lambda) = 1 + \sum_{i=1}^{3} \frac{B_i \lambda^2}{\lambda^2 - C_i}$$

`ior.glass('SF11')` is a dense flint ($n_d = 1.785$, Abbe number 25.7: strongly dispersive). The **spectral** engine traces each path at a *hero wavelength* (plus three companions spread over the visible range), so every refraction bends by the right amount for that colour, and the result is accumulated through the CIE matching functions.

The RGB engine has one index per path — it uses $n_d$ and reports **W610**: the dispersion you asked for is being ignored.

> **Try it.** Toggle **Spectral** off: the fringes vanish, and W610 appears in the Console.
