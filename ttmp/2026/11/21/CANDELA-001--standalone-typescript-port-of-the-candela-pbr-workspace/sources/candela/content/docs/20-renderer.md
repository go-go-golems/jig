---
id: renderer
title: How the renderer works
group: The engine
about: the kernel, BVH, lobes as stochastic selection, NEE and MIS, media, spectral rendering
order: 20
---
# How the renderer works

The kernel is one program, written once in a strict subset of WGSL. Generated code is spliced into it: one function per material, per SDF, per density field, per custom integrator.

## Geometry

Every object is a **record of six vec4s**: its type and material, the inverse of its world transform (rows of a 3×4 matrix), its parameters. Rays are transformed into object space, so a sphere is always the unit-radius kind of sphere and non-uniform scale costs nothing. Analytic shapes (sphere, plane, rect, disk, box, cylinder) are solved in closed form; tori, capsules, cones, rounded boxes, prisms, heightfields and your own `shape.sdf` are **sphere-traced** inside a bounding sphere. Bounded objects sit in a **BVH** (median splits, leaves of ≤ 3); infinite planes are tested separately. Triangle meshes add a second level: each mesh definition has its own BVH (binned SAH) in object space, shared by its instances — see *CAD: meshes, poses, finishes, output*.

## Materials: the algebra as stochastic selection

A material function returns **one lobe** per shading point. `mix(a, b, t)` picks `a` with probability $1-t$; `add(a, b)` picks either with probability ½ and doubles the weight; `layer(coat, base)` picks the coat with probability $F(\theta)$ (Fresnel at the shading point), otherwise goes through to the base, attenuated by the coat's tint $T^{1 + 1/\mu}$. The expected value of a random choice of lobe equals the combination, so the estimator stays unbiased while the kernel only ever evaluates a single, simple BSDF.

The leaves:

```text
  lambert        f = ρ/π                                   cosine sampling
  conductor      GGX, height-correlated Smith G₂, exact complex Fresnel (η + ik per channel)
                 visible-normal sampling (Heitz 2018); × (1 + F0 (1/E(μ,α) − 1)) multiple-scattering compensation
  dielectric     GGX reflection + refraction chosen by Fresnel (Walter et al. 2007); smooth = delta
  thin           a thin sheet: reflect R or pass straight through, R = r + (1−r)² r / (1 − r²)
  sheen          Charlie distribution, Neubelt visibility
  thin film      Airy summation for s and p over a substrate: interference by wavelength
```

## Transport

Leaving a closed dielectric, the relative index is inverted ($1/n$), so refraction bends away from the normal and total internal reflection happens where it should. A pure glow — an emissive material over a black BSDF — casts no shadow, so a point light can sit inside a flame.

Each path vertex does **next-event estimation**: it picks one light among the scene's lights, the sun and the environment, samples it, traces a shadow ray, and weights the result against BSDF sampling with the **power heuristic** $w = p_a^2/(p_a^2 + p_b^2)$. When a BSDF-sampled ray later hits the same emitter (or escapes to the sky), the complementary weight is applied — so the two strategies add up to exactly one estimate. After a few bounces **Russian roulette** ends paths with probability $1 - q$, and survivors are divided by $q$.

## Media

Fog is a homogeneous medium filling a sphere around the scene (the objects' bounds and the camera, or `extent`), with clear air beyond — so the sun and sky still arrive, attenuated by the fog they cross. Whether a segment scatters is decided with the analog probability $1 - e^{-\sigma_t \ell}$; *where* it scatters is a one-sample mixture of free-flight sampling and **equi-angular sampling** toward each point and spot light (Kulla & Fajardo 2012), weighted by the mixture's pdf — which is what makes halos around lamps converge. Scattering uses Henyey–Greenstein, and shadow rays carry $e^{-\sigma_t d}$ over the part of their length inside the fog.

A shape's interior medium switches on when a path refracts inside through a front face and off when it leaves through a back face. A purely absorbing medium (coloured glass, wine) is not sampled at all: the path's weight is multiplied by Beer–Lambert's $e^{-\sigma_a d}$ along each segment. A scattering interior (subsurface) is a random walk; its events have their own budget of 256, separate from surface bounces. The walk's *visible* albedo is what you set: `material.subsurface({ albedo })` inverts it to the single-scattering albedo the walk needs (Chiang, Kutz & Burley 2016). Rough dielectric boundaries are evaluated in both directions — reflection and transmission (Walter et al. 2007) — so a walk that reaches the surface from inside connects to point and spot lights outside by next-event estimation. Heterogeneous media use **delta tracking** against a majorant; shadow rays use **ratio tracking**. With `majorant: 'auto'` the majorant comes from **interval arithmetic** over the density's IR — the same DAG that becomes WGSL is evaluated on intervals.

## Spectral rendering

With `.spectral()` each sample carries one wavelength. RGB reflectances are lifted to smooth spectra (a positive partition of unity), blackbody lights use Planck's law, glasses use their Sellmeier or Cauchy IOR at that wavelength, conductors interpolate η and k, thin films interfere exactly. The sample is projected through the CIE 1931 matching functions (Wyman–Sloan–Shirley fits) to XYZ and then linear sRGB, white-balanced so a flat spectrum is white.

## The camera

A thin lens: the aperture radius is $f/2N$, the focal plane at the focus distance; with `.blades(n)` the aperture is a polygon. Exposure follows the photographic definitions — see [exposure](lab:doc?id=exposure).
