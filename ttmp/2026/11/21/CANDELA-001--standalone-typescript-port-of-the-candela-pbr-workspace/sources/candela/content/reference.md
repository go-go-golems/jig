# Candela reference

A scene file is a module. `export default` a scene; optionally `export const engine`. Everything below is importable from `'candela'` (and is also in scope without an import). Every builder is **immutable**: each method returns a new builder.

```js
import { scene, shape, material, bsdf, ior, light, camera, medium, phase, engine, integrator, pass, fx, param, params, fragment, units as u } from 'candela';
export default scene().add(shape.sphere(1).at(0, 1, 0).material(material.pbr())).light(light.daylight()).camera(camera.thinLens().at(0, 1.5, 5).lookAt(0, 1, 0));
export const engine = engine.offline();   // `export const engine` is special: it does not shadow the import
```

## Units — `u`

`u.lm` flux · `u.cd` intensity · `u.lux` / `u.lx` illuminance · `u.nit` luminance · `u.K` temperature · `u.m` `u.cm` `u.mm` `u.um` `u.nm` length · `u.deg` `u.rad` angle · `u.s` `u.ms`. Bare numbers mean the slot's canonical unit (metres, radians, lm, cd, lx, nit, K). A wrong dimension is **E120**. Strings work where people type: `'1200 lm'`, `'35 deg'`, `'f/4'`.

## Shapes — `shape.*`

`sphere(r)` · `plane(size?)` (no size = infinite) · `rect(w, h)` (faces +y) · `disk(r)` · `box(w, h?, d?)` · `cube(s)` · `cylinder(r, h)` · `capsule(r, h)` · `torus(R, r)` · `roundedBox(w, h, d, radius)` · `cone(r, h)` · `prism({ size, depth })` · `sdf(p => distance, { bound })` (traced from `p.P`, local) · `heightfield(p => h, { size, height })`.

Placement (shapes, lights, groups): `.at(x, y, z)` · `.x(v)` `.y(v)` `.z(v)` · `.rotateX|Y|Z(angle | field of time)` · `.scale(s | sx, sy, sz)` · `.facing(x, y, z)` (point local +y at a target) · `.id('name')` · `.tag('t')` · `.material(m)` · `.emit(light.area()…)` (rect, disk, sphere) · `.child(node)` · `.behavior((self, { t, dt }) => …)` (host, per frame: `self.position.y = …`, `self.rotation.y += dt`; needs an `.id()`) · `.visible(false)`.

Meshes: `shape.mesh(def)` (an instance of a mesh definition, below) · `.face(selector, material)` (per CAD face; later bindings win) · `.autoFinish()` (materials from part + face metadata via `finish.fromMetadata`) or `.autoFinish((meta, face) => material)`.

Groups: `scene.group([nodes])` or `scene.group((g, { rng }) => { g.add(…) })` (a build lambda, run once; use the seeded `rng`, not `Math.random` — **W501**). `scene.scatter({ count, seed, area: [w, d], density: p => 0‥1, place: (i, { rng, P }) => node })`.

## Meshes — `mesh.*`

A **definition**: triangles, a face index per triangle, a face table `[{ id, meta }]` and part metadata; instanced with `shape.mesh(def)`, its BVH (binned SAH) is built once and shared by every instance.
`mesh.fromArrays({ positions, indices, normals?, uvs?, faceIds?, faces?, name, meta })` · `mesh.fromOBJ(text, { name, meta })` (`g`/`o` groups become faces) · generators with named faces: `box(w, h, d)` (right left top bottom front back) · `revolve([[r, y], …], { faces, segments, closed })` · `cylinder(r, h)` · `tube(ro, ri, h)` · `shaft([[length, radius], …])` (d0, d1… and shoulders) · `torus(R, r)` · `gear({ teeth, module, width, bore, pressure })` (face-0 face-1 flank tip root bore) · `prism(sides, acrossFlats, h)` · `hexBolt({ d, length })` · `nut({ d })` · `washer({ d })` · `bearing({ outer, inner, width, balls })` · `merge([{ mesh, at, rotateX, rotateY, prefix }], { name, meta })`.
`def.withMeta({ … })` · `def.withFaceMeta(selector, { … })` (new definitions sharing triangles and BVH) · `def.faces` `def.count` `def.bounds`. Selectors: an id, a glob `'d*'`, a RegExp, a list, or `face => bool`.

## Materials

`material(bsdf)` — a plain material from a BSDF. Methods: `.emission(colour, u.nit(L))` · `.normal(field)` · `.interior(medium)` · `.exterior(medium)`.

`material.pbr()` — metallic/roughness, defined in the grammar: `baseColor` `metallic` `roughness` `specular` (F0 = 0.08·specular) `ior` `transmission` `coat` `coatRoughness` `coatColor` `sheen` `sheenColor` `sheenRoughness` `thinFilm` (nm) `anisotropy` (0‥1: α·a along the tangent, α/a across, a = √(1 − 0.9·anisotropy)) `anisotropyRotation` (turns) `tangent` (an object-space direction field: `fx.tangent.around(axis, centre)` · `along(dir)` · `radial(axis, centre)`). Each takes a value, a param or a field.

`finish.*` — CAD finishes as `material.pbr()` builders: `turned` `faced` `milled` `ground` `brushed` `hobbed` `polished` `asCast` (`{ metal, axis, center, direction, roughness, anisotropy }`; metal: steel stainless bearing-steel tool-steel cast-iron iron aluminium brass bronze copper titanium chrome nickel zinc gold, or an F0 colour) · `blackOxide({ process })` `zinc({ process, yellow })` `anodized(colour, { process })` · `paint(colour, { gloss })` `powderCoat(colour)` `plastic(colour)` `rubber(colour)` `glass()` · `finish.fromMetadata({ material, process, finish, color, axis, center, direction })` → a material or null.

Sugar: `material.diffuse(c)` · `plastic(c, r)` · `metal('Au'|'Ag'|'Cu'|'Al'|'Fe'|'Cr'|'Ti'|'Ni'|'Pt'|'Zn'|'W'|'brass', { roughness })` · `mirror()` · `glass({ ior, roughness, tint, absorb, distance })` · `water()` · `emissive(c, u.nit(L))` (a pure glow: casts no shadow, so a light can sit inside it) · `subsurface({ albedo, meanFreePath, g, ior, roughness })` · `velvet(c)` · `carPaint(pigment, { flakes, coatRoughness })` · `soapFilm({ thickness })` · `ceramic(c)` · `rubber(c)` · `chalk(c)`.

`material.define(name, { attr: param.float(…), … }, m => bsdf)` makes a new material kind; its attributes become methods, sliders and fragment targets.

## The BSDF algebra — `bsdf.*`

Leaves: `lambert(ρ)` · `dielectric({ ior | f0, roughness, tint, reflectOnly, tangent, rotation })` · `conductor({ ior: ior.metal('Au') | 'Au', roughness: r | [along, across], tangent, rotation })` · `conductor.schlick({ f0, roughness, tangent, rotation })` · `sheen({ color, roughness })` · `thinDielectric({ ior, tint })` · `mirror()`.
Combinators: `mix(a, b, t)` (convex, always valid) · `layer(top, bottom, { thickness, tint })` (top = dielectric coat or sheen; Fresnel-coupled) · `add(a, b)` (checked: **W420** when ρ > 1) · `a.scale(k)`. Modifiers: `.normal(field)` · `.thinFilm({ thickness: u.nm(…), ior })` · `.multiscatter('kulla-conty' | false)`.
Roughness is perceptual: α = roughness². Conductors include multiple-scattering compensation by default.

`ior.metal(name)` (η + ik at 650/550/450 nm) · `ior.glass('N-BK7'|'F2'|'SF11'|'fused-silica')` · `ior.sellmeier({ B, C })` (λ in µm; `.at(u.nm(…))`, `.abbe()`) · `ior.cauchy(A, B)` · constants `ior.water` `ice` `diamond` `sapphire` `acrylic` `quartz`. Wavelength-dependent IORs disperse only with `engine…spectral()` (else **W610**).

## Lights — photometric

`light.point()` `.power(u.lm)` | `.intensity(u.cd)` · `.radius(m)` (a visible bulb) · `light.bulb(lm, K)` · `light.spot()` `.power()` `.cone(angle)` `.softEdge(angle)` `.aim(x, y, z)` `.powerMode('cone'|'masked')` · `light.area()` `.power(u.lm)` | `.luminance(u.nit)` `.twoSided()` (give it a shape with `.emit`) · `light.sun()` `.elevation()` `.azimuth()` `.illuminance(u.lux)` (default: Kasten–Young air mass + Meinel) `.angularDiameter()` · `light.sky.physical({ turbidity })` `.fromSun()` (Preetham) · `light.daylight({ elevation, azimuth, turbidity })` · `light.env.uniform(u.nit)` · `light.env.studio({ intensity, rotate })` · `light.env.gradient({ top, bottom, intensity })` · `light.env.night()` · `light.env.hdri(image, { luminance: u.nit | intensity, rotate })` (equirectangular, importance-sampled) with `hdri.studio({ boxes: [{ az, el, w, h, L }], wall, floor })` · `hdri.outdoor({ sunElevation, sunAzimuth, sunLuminance, skyLuminance })` · `hdri.parse(bytes)` (Radiance .hdr) · or an asset name (`assets.list()`; drop a file on the viewport).
All take `.temperature(u.K)` or `.color(c)`; `.at()`, `.id()`. Conversions: point I = Φ/4π; spot I = Φ/2π(1 − cos θ); area L = Φ/πA.

## Camera

`camera.thinLens()` · `camera.pinhole()`: `.at()` `.lookAt()` `.focal(u.mm)` `.fstop(N)` (N ≥ 0.5, **E123**) `.shutter(s)` `.iso(S)` `.exposure(ev100 | 'auto' | param)` `.focus(m)` `.focusOn('#id')` `.blades(n)` `.bladeRotation(angle)` `.sensor(u.mm(36))` `.motionBlur({ angle, fps, steps } | { shutter, steps } | false)` (steps 2–32: the scene — poses, fields of time — is sampled across the shutter; rigid motion + uniform scale). Setting shutter or ISO makes exposure physical: EV100 = log₂(N²/t) − log₂(S/100); saturation L_max = 1.2·2^EV100. Getters: `.ev100` `.lMax` `.fov`.

## Media

`medium.homogeneous({ albedo, meanFreePath | sigmaT, phase: phase.hg(g), extent })` (as the scene's air it fills a sphere of radius `extent` around the scene — by default the objects' bounds and the camera — with clear air beyond, so the sun still arrives) · `medium.absorbing({ tint, distance })` · `medium.heterogeneous({ density: fx.field(p => σt), bounds: shape.box(…).at(…), albedo, phase, majorant: 'auto' | number })` (auto = interval arithmetic over the field; unbounded → **E450**) · `medium.fog({…})`. Use `scene().medium(m, …)` for the air (one homogeneous medium; any number of bounded heterogeneous ones), `material.interior(m)` inside a shape. Volume scattering events have their own budget (256), separate from surface bounces.

## Fields — `fx`

A field is a traced expression: `fx.pattern(p => …)` (or a lambda wherever a value goes). Context `p`: `P` `N` `Ng` `uv` `wo` `time` `lambda` `local` `instance.random`. Methods: `add sub mul div neg abs floor ceil fract mod sin cos pow min max clamp sat oneMinus mix(a, b) smoothstep(e0, e1) step(e) remap(a, b, c, d) dot cross length normalize gt lt gte lte between(lo, hi) and or not select(a, b) luminance maxComponent` and swizzles `.x .xz .rgb`. Functions: `fx.float vec2 vec3 color mix select smoothstep step min max clamp abs sin cos sqrt pow length normalize dot cross luminance time() hash checker(uv, n) stripes(x, n) ramp(x, [[t, c], …]) remap`, `fx.noise.perlin(p)` (≈ [−1, 1]) `fbm(p, { octaves, lacunarity, gain })` `ridged` `turbulence` `voronoi(p) → { dist, edge, cellRandom, randomVec3 }` `worley`, `fx.bump(p => heightInMetres, amount)` (a normal), `fx.blackbody(K)` (a constant or a field of kelvin; colour at luminance 1), `fx.tangent.around(axis, centre)` `along(dir)` `radial(axis, centre)` (groove directions for anisotropy), `fx.field(p => …)` (media).
**JS is the macro language:** JS numbers and loops run at trace time (they unroll); fields run on the GPU. JS arithmetic or comparison on a field is **E201/E202**: use `.mul()`, `fx.select()`.

## Params

`params({ name: param.float(v).range(a, b).step(s).label('…').scale('log').about('…'), … })`; kinds `float int bool color angle length lumen lux nit kelvin ev choice([…])`. Use a param anywhere a value goes; field methods work on it directly (`P.gloss.mul(2)`, `P.k.oneMinus()`). `.static()` makes it a specialisation constant (changing it rebuilds; kernels are cached). `.map(v => …)` runs on the host when it moves; `.select(a, b)` (bool); `.pick({ a: …, b: … })` and `.build(v => …)` (static). Attach with `scene().params(P)`. JS arithmetic on a param is **E203**.

## Engines, integrators, passes

`engine.realtime()` (5 bounces, denoised) · `engine.preview()` (½ res) · `engine.offline()` (12 bounces, MIS) — `.integrator(i)` `.spectral()` (hero wavelength) `.post(…passes)` `.maxDepth(n)` `.spp(n)` (stop) `.sppPerFrame(n)` `.scale(k)` `.denoise(on)`.
`integrator.path({ maxDepth, nee, mis: 'power'|'none', rr: { after }, clamp })` · `integrator.albedo()` `normals()` `depth()` `ao({ radius })` · `integrator.define(name, { params, kernel: ({ ray, scene, sampler }, P) => colour })` (use it as `toon` or `toon()`) with `scene.intersect(ray) → hit { missed, t, P, N, Ng, uv, albedo, emission, spawn(dir) }`, `scene.occluded(o, d, maxT)`, `scene.env(d)`, `scene.sunDir`, `sampler.next1D()` `next2D()` `cosineHemisphere(N)` `uniformSphere()`.
`pass.tonemap('agx'|'aces'|'neutral'|'filmic'|'reinhard'|'linear')` · `pass.denoise()` · `pass.bloom({ strength })` · `pass.falseColor()` · `pass.vignette({ strength })` (cos⁴) · `pass.grain({ amount })` · `pass.define(name, { params, stage: 'hdr'|'display', kernel: ({ color, uv, albedo, normal, luminance }, params) => colour })(opts)`.

## Fragments

`fragment('name').targets('material' | 'material.pbr' | 'light.spot' | 'camera' …).requires('baseColor', …).params({ … }).methods({ m(self, …) {…} }).around('method', (next, self, …args) => …).lower((m, f) => m.map('attr', x => …)).validate((comp, f, r) => r.warn(code, msg))`. Apply with `.with(F)` or globally `candela.use(F)`. Ready-made in `'candela/fragments'`: `weathering` (`.wear()` `.dust()` `.aged(years)`), `rust` (`.rust()` `.rustScale()`), `iridescent` (`.film()`), `plausibleAlbedo`, `bokeh`.

## Tests — `'candela/test'`

`test.furnace(bsdf, { angles, spp })` → directional albedo E(θ) · `test.sweep(r => bsdf, { roughness: […] })` · `test.energy(bsdf)`.

## Poses and animation

`export const animation = t => ({ id: pose, … })` — poses per node id at time t (seconds), evaluated every frame and at each motion-blur step. A pose: a 16-number column-major matrix · `{ matrix }` · `{ position, quaternion: [x, y, z, w] }` · `{ position, rotation: [x, y, z] }` (Euler XYZ, radians) · optional `scale`, `local: true`. A world pose replaces the node's chain (the deepest posed node wins); a local pose replaces only the node's own transform. From the page: `workbench.setPoses(map | t => map | null)` or `postMessage({ type: 'candela.poses', poses })`; these win over `animation`. A pose update is a repack, never a rebuild.

## Output

`workbench.render({ kind: 'still' | 'sequence', width, height, spp, seed, format: 'png' | 'exr' | 'both' | 'mp4' | 'webm', exposure: 'exposed' | 'absolute', time | start, end, fps, seedMode: 'per-frame' | 'fixed', packaging: 'zip' | 'files', quality: 'draft' | 'standard' | 'high' | 'max' | bitrate, keyframeInterval })` → a job on the queue (`workbench.queue.jobs`, `.cancel(id)`). Video (sequences only): MP4 is H.264 High profile, WebM is VP9 (VP8 where VP9 is missing), encoded with WebCodecs, even width and height, a keyframe every `keyframeInterval` s (default 2); quality is bits per pixel per frame — 0.06, 0.12, 0.22, 0.4. EXR: 32-bit float, uncompressed; channels `R G B A`, `albedo.R/G/B`, `N.X/Y/Z`, `Z`, `id.instance`, `id.face`. Agent `eval`: `render.still(o)` `render.sequence(o)` `render.exr(o)` `render.video(o)` `render.queue()` `render.cancel(id)` `render.ids(x, y)` `render.seek(t)` `render.poses(p)` `render.seed(n)`.

## Diagnostics

E104 unknown method (did-you-mean) · E105 builders are immutable · E120 unit/dimension · E121 out of domain · E122 field type · E123 impossible optics · E130/E131/E140 fragments · E141 no node matches · E150 module not found · E160 no scene exported · E162 `animation` is not a function · E163 `animation(0)` threw · E201/E202 JS arithmetic or branching on a field · E203 JS arithmetic on a param · E207 context field not available · E450 unbounded density · E710 no lowering (e.g. `fx.host` on the GPU) · E720 render cancelled · E730 video encoding unavailable or failed · W330 implausible albedo · W335 partial metallic · W340 IOR < 1 · W345 area light without a shape · W170 a pose names no node · W420 BSDF add > 1 · W501 Math.random in a build lambda · W610 dispersion in an RGB engine · I205/I206/I207/I208/I451/I455 notes. Silence a warning with `.unchecked('W330')`.

## The live world (agent `eval`, behaviours)

`world.$('#id')` reads props (`.power`, `.position`, `.material.roughness`) and writes patches (`world.$('#key').power = 1500` recompiles only if structure changed — then it is a cached kernel swap). `world.$$('.tag')` · `world.ids()`.
