---
id: M-12
title: The white furnace
group: Materials
about: A rough mirror in a uniform environment should vanish. Without multiple-scattering compensation it goes dark at high roughness.
tries: Open the Lab and read the furnace numbers|Turn compensation off on the left spheres
docs: invariants, renderer
focus: console
---
# The white furnace

Put a lossless material in a uniform, white environment and it must **disappear**: everything it reflects is the same white. This is the furnace test, and it catches energy loss.

The single-scattering GGX model loses the light that bounces more than once between microfacets — up to 40 % at roughness 1. The spheres on the **left** use `.multiscatter(false)`; those on the **right** use Kulla–Conty compensation (the default), which adds the missing energy back using a precomputed table $E(\mu, \alpha)$.

The scene file also runs `test.furnace` on the CPU and logs the albedo per angle — look in the **Console**.
