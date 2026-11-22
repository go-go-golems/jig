---
id: K-05
title: Lit by an HDRI
group: Machines
about: A chrome ball, a grey ball and a bearing in a studio, then outdoors under a 100 klx sun — the environment importance-sampled — or in an .hdr you drop on the viewport.
tries: Switch to outdoor and rotate the sun behind the bearing|Drop an .hdr file on the viewport and pick it|Give the studio a warmer key light (hdri.studio({ boxes }))|How bright is the sun texel?
docs: cad
focus: params
---
# Lit by an HDRI

`light.env.hdri(image, { luminance | intensity, rotate })` puts an equirectangular image around the scene. Its texels are **radiance** — nits — so a calibrated HDRI lights the scene at its real level; `intensity` multiplies it and `luminance` rescales it to a given average.

Images come from three places:

- `hdri.studio({ boxes })` — a photo studio: dark walls, a floor and rectangular softboxes at given azimuth, elevation, size and luminance;
- `hdri.outdoor({ sunElevation, sunAzimuth })` — a clear sky with a sun of about 1.6·10⁹ nit over half a degree (≈ 100 klx);
- a **dropped file** — a Radiance `.hdr` (or a PNG/JPEG, read as sRGB) dropped on the viewport or added under Scene → Assets, then used by name: `light.env.hdri('my-studio')`.

**Importance sampling.** The outdoor sun covers a few hundred of half a million texels but carries most of the light. Sampled uniformly, it would be found by one path in thousands and the image would sparkle for minutes. The compiler builds an **alias table** over texels, weighted by luminance × sin θ (the solid angle a texel of an equirectangular map covers), so a direction is drawn in proportion to the light coming from it in O(1); its pdf is converted to solid angle and combined with BSDF sampling by multiple importance sampling. A big, dim environment and a tiny, bright sun both converge.

The rotation is a param: turning the environment moves the softboxes in the chrome ball without a rebuild.
