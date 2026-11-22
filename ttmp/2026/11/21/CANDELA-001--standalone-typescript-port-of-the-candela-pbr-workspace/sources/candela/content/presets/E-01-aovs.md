---
id: E-01
title: Integrators: what the denoiser sees
group: Engines
about: The same scene through six integrators: path tracing, albedo, normals, depth, ambient occlusion — and what each is for.
tries: Which AOVs does the denoiser use?|Set AO radius to 2 m
docs: renderer, monte-carlo
focus: params
---
# Integrators: what the denoiser sees

An **integrator** decides what a path computes. Swapping it rebuilds the kernel (a static choice), and each one is useful on its own:

| integrator | gives | used for |
| --- | --- | --- |
| `path()` | radiance (the image) | everything |
| `albedo()` | first-hit reflectance | denoiser guide, material checks |
| `normals()` | first-hit shading normal | denoiser guide, bump checks |
| `depth()` | distance to the first hit | compositing, DoF checks |
| `ao({ radius })` | ambient occlusion | a quick, light-independent look at form |

The à-trous denoiser uses albedo, normal and depth (computed alongside every path) to keep edges sharp while it averages noise away.
