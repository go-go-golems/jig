---
id: reading
title: Further reading
group: Design
about: the papers and books the design builds on
order: 43
---
# Appendix C — Further reading

The physics and algorithms this design builds on:

- Pharr, Jakob, Humphreys — *Physically Based Rendering: From Theory to Implementation*, 4th ed. (2023): radiometry, the measurement equation, integrators, spectral rendering.
- Veach — *Robust Monte Carlo Methods for Light Transport Simulation*, PhD thesis (1997): MIS, the power heuristic, shading-normal asymmetry.
- Walter, Marschner, Li, Torrance — *Microfacet Models for Refraction through Rough Surfaces* (EGSR 2007): GGX.
- Heitz — *Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs* (JCGT 2014): height-correlated Smith.
- Burley — *Physically-Based Shading at Disney* (SIGGRAPH 2012 course): the perceptual roughness remap, `specular · 0.08`.
- Karis — *Real Shading in Unreal Engine 4* (SIGGRAPH 2013 course): split-sum IBL.
- Lagarde, de Rousiers — *Moving Frostbite to Physically Based Rendering* (SIGGRAPH 2014 course): photometric lights, EV100, `L_max = 1.2 · 2^EV100`.
- Kulla, Conty — *Revisiting Physically Based Shading at Imageworks* (SIGGRAPH 2017 course): multiple-scattering energy compensation.
- Heitz, Dupuy, Hill, Neubelt — *Real-Time Polygonal-Light Shading with Linearly Transformed Cosines* (SIGGRAPH 2016).
- Wilkie, Nawaz, Droske, Weidlich, Hanika — *Hero Wavelength Spectral Sampling* (EGSR 2014).
- Jakob, Hanika — *A Low-Dimensional Function Space for Efficient Spectral Upsampling* (Eurographics 2019).
- Belcour, Barla — *A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence* (SIGGRAPH 2017).
- Novák, Georgiev, Hanika, Jarosz — *Monte Carlo Methods for Volumetric Light Transport Simulation* (Eurographics STAR 2018): delta and ratio tracking, majorants.
- Christensen, Burley — *Approximate Reflectance Profiles for Efficient Subsurface Scattering* (Pixar, 2015).
- Hosek, Wilkie — *An Analytic Model for Full Spectral Sky-Dome Radiance* (SIGGRAPH 2012).
- O'Donnell — *FrameGraph: Extensible Rendering Architecture in Frostbite* (GDC 2017).
- Andersson et al. — *FLIP: A Difference Evaluator for Alternating Images* (HPG 2020).
- Loubet, Holzschuch, Jakob — *Reparameterizing Discontinuous Integrands for Differentiable Rendering* (SIGGRAPH Asia 2019).
- Vicini, Speierer, Jakob — *Path Replay Backpropagation* (SIGGRAPH 2021).
- Kasten, Young — *Revised Optical Air Mass Tables and Approximation Formula* (Applied Optics, 1989).
