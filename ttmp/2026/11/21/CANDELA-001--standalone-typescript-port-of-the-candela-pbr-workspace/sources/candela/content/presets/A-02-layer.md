---
id: A-02
title: layer: varnish over wood
group: Algebra
about: bsdf.layer(top, bottom) couples a dielectric coat to anything below it by Fresnel — energy-conserving by construction.
tries: Thicken the varnish tint|What happens if the top layer is a conductor?
docs: grammar
focus: params
---
# layer: varnish over wood

```js
bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.05 }), wood, { tint: '#e0a040', thickness: 0.3 })
```

The top layer reflects $F(\theta)$; the bottom receives $1 - F(\theta)$, attenuated by the layer's **tint** on the way in and out (longer paths at grazing angles absorb more). The top of a layer must be a dielectric or a sheen; a conductor on top would let nothing through, which is **E133**.
