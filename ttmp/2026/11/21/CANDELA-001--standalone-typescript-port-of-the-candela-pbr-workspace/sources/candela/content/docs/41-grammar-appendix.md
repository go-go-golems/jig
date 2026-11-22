---
id: grammar-appendix
title: The grammar, compactly
group: Design
about: the API as a grammar, with stages marked
order: 41
---
# Appendix A — The grammar

```text
Scene       := scene(opts?) { .add(Node…) | .light(Light) | .camera(Camera) | .medium(Medium)
                             | .params(Params) | .with(Fragment) | .edit(sel, fn) }

Node        := Shape [Placement] [.material(Material)] [.emit(Light)] [.behavior(fn③)]
                     [.id(s)] [.tag(s)] [.part(name, fn①)] [.child(Node)]
             | scene.group(fn①) | scene.scatter({ on, count, seed, density: Field, place: fn① })
             | Param.build(fn①) | Light
Placement   := .at(x,y,z) | .rotateX|Y|Z(Angle | Field) | .scale(s) | .lookAt(p) | .alignTo(N)

Shape       := shape.sphere | plane | rect | box | cylinder | prism | mesh(url) | heightfield(Field) | …

Material    := material(Surface) [.interior(Medium)] [.exterior(Medium)] [.emission(Field<Radiance>)]
                                 [.normal(Field<Normal>)] [.displace(Field<Length>)]
             | material.define(name, ParamSpec, m ⇒ Surface)        -- e.g. material.pbr, user materials
             | Material.with(Fragment)

Surface     := bsdf.lambert(Field<Refl>) | bsdf.dielectric({ ior | f0, roughness })
             | bsdf.conductor({ ior: η+ik | f0, roughness }) | bsdf.sheen(…) | bsdf.thinDielectric(…)
             | bsdf.mix(Surface, Surface, Field<[0,1]>)             -- always valid
             | bsdf.layer(Surface, Surface, { thickness, tint })    -- valid by construction
             | bsdf.add(Surface, Surface)                           -- checked (W420)
             | Surface.scale(Field<[0,1]>) | .normal(Field) | .thinFilm(…) | .multiscatter(…)

Medium      := medium.homogeneous({ albedo, meanFreePath | σa, σs, phase })
             | medium.heterogeneous({ density: Field, albedo, phase, majorant, bounds }) | medium.vdb(url, …)

Light       := light.point | spot | area | sun | sky.physical | env(url) | daylight
               [.power(lm) | .intensity(cd) | .illuminance(lx) | .luminance(nit)]
               [.temperature(K) | .spectrum(Spectrum)] [.cone(Angle)] [.with(Fragment)]

Camera      := camera.thinLens | pinhole | ortho | spherical | fromPhoto(url)
               [.focal .fstop .shutter .iso .exposure(EV | 'auto' | 'meter:sel') .focusOn(sel)]

Field<T>    := literal | Quantity | Param<T> | fx.pattern(p ⇒ Expr②) | fx.field(p ⇒ Expr②)
             | fx.texture(url, { colorSpace, role }) | fx.noise.* | fx.host(fn③)  -- CPU backend only
Expr        := Field.op(…) | fx.mix | select | when | loop | ramp | …   (typed, unit-checked)

Param<T>    := param.float | int | bool | color | angle | length | lumen | kelvin | ev | choice
               .range .step .scale .label .unit .role [.static()]  [.map(fn③)] [.select | .pick | .build(fn①)]

Engine      := engine.offline | realtime | cpu | preview | adaptive({ interactive, idle })
               [.integrator(Integrator)] [.graph(g ⇒ Pass DAG①)] [.sampler] [.spectral] [.film] [.post…]
               [.backend] [.differentiable] [.cache] [.with(Fragment)]
Integrator  := integrator.path(…) | integrator.define(name, { params, kernel: ctx ⇒ Expr② })
Pass        := pass.* | pass.define(name, { inputs, params, kernel: ctx ⇒ Expr② })

Fragment    := fragment(name).targets(kinds…) [.requires(attrs…)] [.params] [.methods(fn①)]
               [.around(method, fn①)] [.lower(fn②)] [.pass(stage, fn)] [.validate(fn)] [.assets]

World       := Engine.run(Scene) → { $(sel), $$(sel), add, remove, tx, on, meter, history, agent(…) }

①  build stage  · ②  trace stage  · ③  run stage
```
