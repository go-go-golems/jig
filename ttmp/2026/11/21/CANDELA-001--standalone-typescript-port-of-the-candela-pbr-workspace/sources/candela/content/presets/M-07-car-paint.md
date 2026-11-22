---
id: M-07
title: Car paint
group: Materials
about: Pigment, metallic flakes and a clear coat: a three-layer BSDF built from the algebra, with sliders for each layer.
tries: Swap to a pearl white paint|What does the clear coat add at grazing angles?
docs: renderer
focus: params
---
# Car paint

Car paint is a **layered** material:

```js
bsdf.layer(
  bsdf.dielectric({ ior: 1.5, roughness: coatRoughness }),              // clear coat
  bsdf.mix(bsdf.lambert(pigment), bsdf.conductor({ ior: 'Al', roughness: 0.3 }), flakes))
```

The coat is a smooth dielectric that reflects the environment sharply (the "wet look"); the light it transmits reaches a base where diffuse pigment and aluminium flakes are mixed. `layer` couples the two by Fresnel, so the coat's reflection grows at grazing angles and the base gets correspondingly less light — energy is conserved by construction.
