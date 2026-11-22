from mk import P
P('F-01','patterns','Checker, stripes, ramps','Fields','A field is a lambda traced into the material kernel: patterns in world space, in UV space, and through a colour ramp.',
 ['Make the stripes follow the sphere’s UVs instead of world X','Add a third stop to the ramp','Open the Shader view and find the generated pattern code'], ['architecture','gpu'],
 '''
 # Checker, stripes, ramps

 Wherever a value goes, a **lambda** can go instead:

 ```js
 material.pbr().baseColor(p => fx.mix(dark, light, fx.checker(p.P.xz, 4)))
 ```

 The lambda runs **once**, at build time, with a symbolic `p`. Every method call records a node; the result is an expression graph, compiled to WGSL inside the material function. The JS never runs per pixel.

 - floor: `fx.checker(p.P.xz, 2)` — world space, so it does not care which object it is on;
 - left sphere: `fx.stripes(p.uv.x, 12)` — the sphere's own parameterisation;
 - right sphere: `fx.ramp(p.N.y.mul(0.5).add(0.5), [[0, '#14324a'], [0.5, '#e0c090'], [1, '#f6f2e8']])` — a colour ramp driven by the normal.

 > **Try it.** Open **Shader** and search for `checker` — that is your lambda, after optimisation.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const floor = material.pbr().roughness(0.7).baseColor(p => fx.mix(fx.color('#2b2b2b'), fx.color('#c8c0b0'), fx.checker(p.P.xz, 2)));
 const striped = material.pbr().roughness(0.35).baseColor(p => fx.mix(fx.color('#1e4bb3'), fx.color('#f0ebe0'), fx.stripes(p.uv.x, 12)));
 const ramped = material.pbr().roughness(0.4).baseColor(p => fx.ramp(p.N.y.mul(0.5).add(0.5), [[0, '#14324a'], [0.5, '#e0c090'], [1, '#f6f2e8']]));

 export default scene()
   .add(shape.sphere(0.5).at(-0.65, 0.5, 0).material(striped))
   .add(shape.sphere(0.5).at(0.65, 0.5, 0).material(ramped))
   .add(shape.plane(30).material(floor))
   .light(light.daylight({ elevation: u.deg(40), azimuth: u.deg(30) }))
   .camera(camera.thinLens().at(0, 1.3, 3.4).lookAt(0, 0.45, 0).focal(u.mm(40)));
 ''')
P('F-02','marble','Marble from noise','Fields','Veins are a sine wave bent by fractal noise: three lines of fields, no textures.',
 ['Make the veins thinner and darker','Turn it into green serpentine','Add a fine bump so the veins catch the light'], ['architecture'],
 '''
 # Marble from noise

 The classic Perlin recipe: a sine of position, its phase disturbed by turbulence.

 $$v = \\left|\\sin\\big(k\\,(x + a\\cdot \\mathrm{fbm}(\\mathbf p))\\big)\\right|^{s}$$

 `fbm` sums octaves of gradient noise, each at twice the frequency and half the amplitude. The vein **sharpness** `s` is a slider; because it is a param (not a JS number), moving it only updates a uniform — no recompile.

 Marble is also translucent: the base here is a `layer` of a polished coat over the patterned diffuse; see **Materials → Wax, jade, skin** for real subsurface.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({
   warp: param.float(2.4).range(0, 6).label('Warp'),
   sharp: param.float(6).range(1, 24).label('Vein sharpness'),
 });

 const veins = p => {
   const q = p.P.mul(1.6);
   const v = q.x.add(fx.noise.turbulence(q, { octaves: 6 }).mul(P.warp)).mul(3).sin().abs().pow(P.sharp.mul(0.25));
   return fx.mix(fx.color('#3c3a3a'), fx.color('#ece8e0'), v);
 };
 const marble = material.pbr().baseColor(veins).roughness(0.15).coat(1).coatRoughness(0.03);

 export default scene().params(P)
   .add(shape.roundedBox(1.0, 1.0, 1.0, 0.04).at(-0.7, 0.5, 0).rotateY(u.deg(25)).material(marble))
   .add(shape.sphere(0.45).at(0.75, 0.45, 0.2).material(marble))
   .add(shape.plane(30).material(material.pbr().baseColor(0.12).roughness(0.5)))
   .light(light.env.studio({ intensity: u.nit(900), rotate: u.deg(40) }))
   .camera(camera.thinLens().at(0, 1.5, 3.4).lookAt(0, 0.45, 0).focal(u.mm(40)));
 ''', focus='params')
P('F-03','voronoi','Voronoi: cobbles and cells','Fields','fx.noise.voronoi gives the distance to the nearest cell centre, the edge distance and a random value per cell.',
 ['Give each cell a slightly different roughness too','Turn the cobbles into a giraffe pattern'], ['architecture'],
 '''
 # Voronoi: cobbles and cells

 `fx.noise.voronoi(p)` returns an object of fields:

 | field | meaning |
 | --- | --- |
 | `dist` | distance to the nearest feature point |
 | `edge` | distance to the nearest cell border (F2 − F1) |
 | `cellRandom` | a random number, constant over each cell |
 | `randomVec3` | a random vector per cell |

 The floor uses all three: `cellRandom` picks a stone colour from a ramp, `edge` makes the grout, and a **bump** from the same edge distance rounds each cobble — the normal is perturbed by the gradient of a height field, computed by finite differences in the kernel.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const cells = p => fx.noise.voronoi(p.P.mul(fx.vec3(3, 0, 3)));
 const stone = p => {
   const v = cells(p);
   const c = fx.ramp(v.cellRandom, [[0, '#6e675e'], [0.5, '#9a8f80'], [1, '#bdb1a0']]);
   return fx.mix(fx.color('#2a2622'), c, v.edge.smoothstep(0.02, 0.08));
 };
 const height = p => cells(p).edge.smoothstep(0.0, 0.18).mul(0.012);
 const cobbles = material.pbr().baseColor(stone).roughness(0.8).normal(fx.bump(height, 1));

 export default scene()
   .add(shape.plane(40).material(cobbles))
   .add(shape.sphere(0.35).at(0.4, 0.35, 0.3).material(material.metal('Cu', { roughness: 0.2 })))
   .light(light.sun().elevation(u.deg(18)).azimuth(u.deg(110)))
   .light(light.sky.physical({ turbidity: 3 }).fromSun())
   .camera(camera.thinLens().at(0, 1.3, 2.6).lookAt(0, 0.1, -0.2).focal(u.mm(32)));
 ''')
P('F-04','bump','Bump: hammered metal','Fields','fx.bump(height) turns a scalar height in metres into a shading normal: dents from voronoi, scratches from stretched noise.',
 ['Halve the dent depth','Add fine circular scratches'], ['renderer'],
 '''
 # Bump: hammered metal

 ```js
 material.metal('Ag').normal(fx.bump(p => dentDepth(p), 1))
 ```

 A bump field is a height in **metres** over the surface; the kernel evaluates it at three nearby points and tilts the normal by its gradient. Nothing moves — silhouettes stay smooth — but the reflection breaks up exactly as it does on a hammered bowl.

 Left: hammered silver (voronoi distance squared: round dents). Right: brushed steel (noise stretched 60× along one axis). Middle: the same silver without a bump.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({ depth: param.float(1).range(0, 3).label('Dent depth (mm)') });
 const dents = p => fx.noise.voronoi(p.P.mul(14)).dist.pow(2).mul(P.depth).mul(-0.012);
 const scratches = p => fx.noise.perlin(p.P.mul(fx.vec3(2, 160, 2))).mul(0.0006);

 const silver = bsdf.conductor({ ior: 'Ag', roughness: 0.08 });
 const steel = bsdf.conductor({ ior: 'Fe', roughness: 0.18 });

 export default scene().params(P)
   .add(shape.sphere(0.45).at(-1.0, 0.45, 0).material(material(silver).normal(fx.bump(dents, 1))))
   .add(shape.sphere(0.45).at(0, 0.45, 0).material(material(silver)))
   .add(shape.cylinder(0.4, 0.9).at(1.0, 0.45, 0).material(material(steel).normal(fx.bump(scratches, 1))))
   .add(shape.plane(30).material(material.pbr().baseColor(0.1).roughness(0.6)))
   .light(light.env.studio({ intensity: u.nit(1000), rotate: u.deg(-20) }))
   .camera(camera.thinLens().at(0, 1.1, 3.6).lookAt(0, 0.45, 0).focal(u.mm(42)));
 ''', focus='params')
P('F-05','animated','Fields of time','Fields','p.time makes any field move: a scrolling pattern, a pulsing emitter, a slowly turning planet — all on the GPU.',
 ['Make the pulse twice as fast','Pause the clock and scrub time with the agent'], ['architecture','gpu'],
 '''
 # Fields of time

 `p.time` (or `fx.time()`) is seconds since the scene started. A field that uses it is re-evaluated every frame **on the GPU**: no rebuild, no repack — the accumulation restarts because the image changed.

 - the floor's stripes scroll: `fx.stripes(p.P.x.add(p.time.mul(0.2)), 3)`;
 - the ring pulses: its emission is multiplied by `p.time.mul(4).sin().mul(0.5).add(0.5)`;
 - the globe turns: `.rotateY(fx.time().mul(0.4))` is a transform of time, so the host re-packs only that object.

 > **Try it.** Press **Pause** in the viewport: time stops and the image converges. Ask the agent to "set time to 2.5 s".
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const floor = material.pbr().roughness(0.6).baseColor(p => fx.mix(fx.color(0.15), fx.color(0.7), fx.stripes(p.P.x.add(p.time.mul(0.2)), 3)));
 const ring = material.emissive('#000000', u.nit(1)).emission(p => fx.color('#ff7a30').mul(p.time.mul(4).sin().mul(0.5).add(0.6)), u.nit(500));
 const globe = material.pbr().roughness(0.5).baseColor(p => fx.mix(fx.color('#1d4f9a'), fx.color('#3a7a3a'), fx.noise.fbm(p.local.mul(2.5), { octaves: 5 }).smoothstep(0.0, 0.08)));

 export default scene()
   .add(shape.sphere(0.5).at(0, 0.6, 0).rotateY(fx.time().mul(0.4)).material(globe))
   .add(shape.torus(0.75, 0.03).at(0, 0.6, 0).rotateX(u.deg(75)).material(ring))
   .add(shape.plane(30).material(floor))
   .light(light.env.gradient({ top: '#bcd0e8', bottom: '#2a2a2a', intensity: u.nit(400) }))
   .camera(camera.thinLens().at(0, 1.4, 3.2).lookAt(0, 0.5, 0).focal(u.mm(40)));
 ''')
P('F-06','staging','Build time vs. run time','Fields','JS loops run once and unroll; fields run per pixel. The same ripple built both ways — and the difference in the generated code.',
 ['Change OCTAVES to 8 and look at the shader size','Try an if-statement on p.P.y and read the error'], ['architecture','grammar'],
 '''
 # Build time vs. run time

 Two lambdas look alike but live in different worlds:

 ```js
 for (let k = 0; k < OCTAVES; k++) h = h.add(p.P.xz.length().mul(2 ** k * 8).sin().mul(0.5 ** k));
 ```

 The `for` loop and `2 ** k` are **JavaScript**: they run once, while the lambda is traced, and leave behind an unrolled sum of four sines. `p.P.xz.length()` is a **field**: it becomes WGSL and runs for every shading point.

 JS can't branch on a field, because when the lambda runs there is no value yet — only a symbol. `if (p.P.y > 0)` is **E202**, with the fix in the message: `fx.select(p.P.y.gt(0), a, b)`.

 > **Try it.** Set `OCTAVES` to 8, run, and compare the **Shader** view: twice the terms. Then uncomment the last line.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const OCTAVES = 4;                     // a JS number: decides the shape of the code, not a uniform

 const ripple = p => {
   let h = fx.float(0);
   for (let k = 0; k < OCTAVES; k++) h = h.add(p.P.xz.length().mul(2 ** k * 8).sin().mul(0.5 ** k));
   return h.mul(0.0015);
 };

 const water = material.pbr().baseColor('#1a4452').roughness(0.02).coat(1).coatRoughness(0.0).normal(fx.bump(ripple, 1));

 // fx.pattern(p => (p.P.y > 0 ? 1 : 0));   // E202: branch on a field — use fx.select(p.P.y.gt(0), 1, 0)

 export default scene()
   .add(shape.disk(3).at(0, 0.01, 0).material(water))
   .add(shape.torus(3.0, 0.12).at(0, 0.02, 0).material(material.pbr().baseColor('#8d877c').roughness(0.8)))
   .add(shape.plane(40).material(material.pbr().baseColor('#4a5a3a').roughness(0.95)))
   .light(light.daylight({ elevation: u.deg(30), azimuth: u.deg(200) }))
   .camera(camera.thinLens().at(0, 2.0, 4.6).lookAt(0, 0, 0).focal(u.mm(35)));
 ''')
P('F-07','local-world','World space and local space','Fields','p.P is the world position, p.local the object’s own: one pattern slides across moving objects, the other rides with them.',
 ['Rotate both boxes by 45° and compare','Use p.local for the floor — what happens?'], ['architecture'],
 '''
 # World space and local space

 Both boxes carry the **same** checker, three times per metre. On the left it is computed from `p.P` (world space): the pattern stays put while the box turns, like a projector's light on a moving object. On the right it is computed from `p.local`: the pattern is glued to the box.

 Both boxes are turned by `fx.time()`, so you can watch the difference. Most materials want local space; world space is right for things like snow on top (`p.N.y`) or a light projected from outside.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const tile = q => fx.mix(fx.color('#202020'), fx.color('#e8a33c'), fx.checker(fx.vec2(q.x.add(q.y), q.z), 3));
 const worldM = material.pbr().roughness(0.5).baseColor(p => tile(p.P));
 const localM = material.pbr().roughness(0.5).baseColor(p => tile(p.local));

 export default scene()
   .add(shape.box(0.8).at(-0.7, 0.45, 0).rotateY(fx.time().mul(0.5).add(0.6)).material(worldM))
   .add(shape.box(0.8).at(0.7, 0.45, 0).rotateY(fx.time().mul(0.5).add(0.6)).material(localM))
   .add(shape.plane(30).material(material.pbr().baseColor(0.35)))
   .light(light.daylight({ elevation: u.deg(45), azimuth: u.deg(30) }))
   .camera(camera.thinLens().at(0, 1.6, 3.4).lookAt(0, 0.4, 0).focal(u.mm(40)));
 ''')
P('F-08','instance-random','One material, many instances','Fields','p.instance.random gives each instance its own number: 400 pebbles, one material kernel, every one a different colour.',
 ['Make the variation subtler','Vary roughness per instance as well'], ['gpu'],
 '''
 # One material, many instances

 Every object carries a random number fixed at build time. Inside a material, `p.instance.random` reads it — so one compiled material produces a different colour on each instance, the way production renderers vary leaves on a tree.

 400 pebbles below share **one** material kernel (see I205 in the Console). The colour comes from a ramp indexed by the instance's number; the size and squash come from the seeded `rng` in the build lambda — JavaScript, at build time.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const pebble = material.pbr()
   .baseColor(p => fx.ramp(p.instance.random, [[0, '#4a4440'], [0.3, '#8a7f72'], [0.6, '#b9ab98'], [0.85, '#6f6a60'], [1, '#c8b89e']]))
   .roughness(p => fx.mix(0.35, 0.8, p.instance.random));

 const beach = scene.group((g, { rng }) => {
   for (let i = 0; i < 400; i++) {
     const r = 0.05 + rng() * 0.07, x = (rng() - 0.5) * 4, z = (rng() - 0.5) * 3;
     g.add(shape.sphere(r).at(x, r * 0.55, z).scale(1, 0.55, 0.8 + rng() * 0.4).rotateY(rng() * 6.28).material(pebble));
   }
 });

 export default scene()
   .add(beach)
   .add(shape.plane(40).material(material.pbr().baseColor('#cbb994').roughness(0.95)))
   .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(60) }))
   .camera(camera.thinLens().at(0, 1.4, 2.4).lookAt(0, 0, 0).focal(u.mm(35)).fstop(4).focus(2.6));
 ''')
P('G-01','primitives','Analytic primitives','Geometry','Sphere, box, cylinder, disk, rect and plane are intersected exactly; capsule, torus, rounded box, cone and prism are distance fields.',
 ['Which of these are SDFs? Check the Shader view','Line them up by size'], ['renderer','gpu'],
 '''
 # Analytic primitives

 **Back row — closed forms.** Rays meet spheres, boxes, cylinders, disks, rects and planes by solving a quadratic or a slab test: exact, one step.

 **Front row — distance fields.** Capsules, tori, rounded boxes, cones and prisms are signed distance functions, found by **sphere tracing**: step along the ray by the distance to the surface until it is below a tolerance. Their normals are the field's gradient.

 Both kinds share one BVH and one material system, and both run on either backend.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const m = c => material.pbr().baseColor(c).roughness(0.35);
 const back = [
   shape.sphere(0.32).material(m('#c8452e')),
   shape.box(0.55).material(m('#e0a03c')),
   shape.cylinder(0.28, 0.6).material(m('#3c8a5a')),
   shape.disk(0.32).rotateX(u.deg(70)).material(m('#2e6fa8')),
   shape.rect(0.6, 0.6).rotateX(u.deg(70)).material(m('#7a4aa0')),
 ];
 const front = [
   shape.capsule(0.15, 0.4).material(m('#d8d0c0')),
   shape.torus(0.25, 0.08).rotateX(u.deg(60)).material(m('#d8d0c0')),
   shape.roundedBox(0.5, 0.5, 0.5, 0.1).material(m('#d8d0c0')),
   shape.cone(0.28, 0.6).material(m('#d8d0c0')),
   shape.prism({ size: 0.55, depth: 0.3 }).material(m('#d8d0c0')),
 ];

 export default scene()
   .add(back.map((s, i) => s.at((i - 2) * 0.85, 0.34, -0.7)))
   .add(front.map((s, i) => s.at((i - 2) * 0.85, 0.32, 0.4)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.45).roughness(0.8)))
   .light(light.daylight({ elevation: u.deg(50), azimuth: u.deg(35) }))
   .camera(camera.thinLens().at(0, 1.9, 3.8).lookAt(0, 0.2, -0.1).focal(u.mm(32)));
 ''')
P('G-02','sdf','Your own distance field','Geometry','shape.sdf(p => distance): smooth unions of spheres, a twisted bar, a gyroid shell — sphere-traced on the GPU.',
 ['Increase the smooth-union radius','Make the gyroid finer','Twist the bar more'], ['renderer','gpu'],
 '''
 # Your own distance field

 A signed distance function returns, for any point, the distance to the nearest surface (negative inside). Anything you can write as one can be rendered:

 - **blob** — the *smooth minimum* of three spheres, $\\mathrm{smin}(a, b) = \\min(a,b) - h^2 k/4$ with $h = \\max(k - |a - b|, 0)/k$;
 - **twisted bar** — a box evaluated in a frame rotated by an angle proportional to height (not a true distance any more, so it declares `lipschitz: 2` and the tracer takes smaller steps);
 - **gyroid** — $|\\sin x \\cos y + \\sin y \\cos z + \\sin z \\cos x| - t$, intersected with a sphere.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({ k: param.float(0.25).range(0.01, 0.6).label('Smooth union') });
 const smin = (a, b, k) => { const h = fx.max(k.sub(a.sub(b).abs()), 0).div(k); return fx.min(a, b).sub(h.mul(h).mul(k).mul(0.25)); };
 const ball = (p, c, r) => p.P.sub(fx.vec3(...c)).length().sub(r);

 const blob = shape.sdf(p => smin(smin(ball(p, [0, 0, 0], 0.35), ball(p, [0.35, 0.3, 0], 0.25), P.k), ball(p, [-0.25, 0.35, 0.1], 0.2), P.k), { bound: 0.9 });

 const twisted = shape.sdf(p => {
   const a = p.P.y.mul(2.2), c = a.cos(), s = a.sin();
   const q = fx.vec3(p.P.x.mul(c).sub(p.P.z.mul(s)), p.P.y, p.P.x.mul(s).add(p.P.z.mul(c)));
   const d = q.abs().sub(fx.vec3(0.14, 0.6, 0.14));
   return fx.max(d, 0).length().add(fx.min(fx.max(d.x, fx.max(d.y, d.z)), 0));
 }, { bound: 0.75, lipschitz: 2 });

 const gyroid = shape.sdf(p => {
   const q = p.P.mul(14);
   const g = q.x.sin().mul(q.y.cos()).add(q.y.sin().mul(q.z.cos())).add(q.z.sin().mul(q.x.cos())).abs().sub(0.25).div(14 * 1.6);
   return fx.max(g, p.P.length().sub(0.45));
 }, { bound: 0.5, lipschitz: 1.6 });

 export default scene().params(P)
   .add(blob.at(-1.2, 0.4, 0).material(material.pbr().baseColor('#d06a3c').roughness(0.3)))
   .add(twisted.at(0, 0.62, 0).material(material.metal('Au', { roughness: 0.25 })))
   .add(gyroid.at(1.2, 0.46, 0).material(material.pbr().baseColor('#e8e2d6').roughness(0.5)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.2).roughness(0.7)))
   .light(light.env.studio({ intensity: u.nit(900), rotate: u.deg(30) }))
   .camera(camera.thinLens().at(0, 1.3, 3.8).lookAt(0, 0.45, 0).focal(u.mm(40)));
 ''', focus='params')
P('G-03','terrain','Heightfield terrain','Geometry','Ridged fractal noise as a heightfield; snow where the slope is gentle and the altitude high, rock elsewhere.',
 ['Lower the snow line','Make it a desert instead','Put the sun on the horizon'], ['renderer'],
 '''
 # Heightfield terrain

 `shape.heightfield(p => h, { size, height })` lifts a plane by a field of $(x, z)$: here, ridged multifractal noise — $1 - |n|$ per octave, squared — which makes sharp crests and soft valleys.

 The material reads two things the geometry already knows:

 - `p.N.y` — the slope (1 is flat);
 - `p.P.y` — the altitude.

 Snow lies where both are high: `p.N.y.smoothstep(0.75, 0.9).mul(p.P.y.smoothstep(snowLine, snowLine + 0.3))`. It is all one field graph, evaluated on the GPU.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({ snow: param.float(1.1).range(0, 2.5).label('Snow line (m)') });
 const land = shape.heightfield(p => fx.noise.ridged(p.P.mul(0.11), { octaves: 5, gain: 0.45 }).pow(1.6).mul(1.1), { size: 24, height: 3 });

 const rock = fx.color('#6a625a'), grass = fx.color('#4d5a32'), white = fx.color('#eef0f2');
 const ground = material.pbr().roughness(0.85).baseColor(p => {
   const flat = p.N.y.smoothstep(0.75, 0.92);
   const snow = flat.mul(p.P.y.smoothstep(P.snow, P.snow.add(0.3)));
   const low = flat.mul(p.P.y.smoothstep(0.9, 0.3));
   return fx.mix(fx.mix(rock, grass, low), white, snow);
 });

 export default scene().params(P)
   .add(land.material(ground))
   .light(light.sun().elevation(u.deg(22)).azimuth(u.deg(250)))
   .light(light.sky.physical({ turbidity: 2.5 }).fromSun())
   .camera(camera.thinLens().at(0, 3.2, 11).lookAt(0, 0.6, 0).focal(u.mm(35)));
 ''', focus='params')
P('G-04','instancing','900 cubes, one BVH','Geometry','A JS loop places 900 instances in a wave; the BVH makes tracing them cost about as much as tracing nine.',
 ['Make it 60×60','Turn the wave into concentric rings'], ['gpu','renderer'],
 '''
 # 900 cubes, one BVH

 The loop runs at build time: JavaScript computes 900 heights and adds 900 placed instances of **one** box. The compiler packs them into a **bounding volume hierarchy** — a tree of boxes, built with the surface-area heuristic — so a ray visits a handful of nodes instead of 900 objects.

 Look at the status bar: the per-frame time is close to the simple scenes'. The cubes share one material, coloured by height through `p.P.y`.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const N = 30, s = 0.12;
 const cube = shape.box(s * 0.92, 1, s * 0.92);
 const m = material.pbr().roughness(0.4).baseColor(p => fx.ramp(p.P.y.mul(1.4), [[0, '#183a5a'], [0.5, '#3aa0a0'], [1, '#f0e0a0']]));

 const field = scene.group(g => {
   for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
     const x = (i - N / 2) * s, z = (j - N / 2) * s, r = Math.hypot(x, z);
     const h = 0.15 + 0.35 * (1 + Math.sin(r * 5 - x * 1.5)) * Math.exp(-r * 0.35);
     g.add(cube.at(x, h / 2, z).scale(1, h, 1).material(m));
   }
 });

 export default scene()
   .add(field)
   .add(shape.plane(40).material(material.pbr().baseColor(0.1)))
   .light(light.daylight({ elevation: u.deg(38), azimuth: u.deg(130) }))
   .camera(camera.thinLens().at(2.6, 2.4, 3.4).lookAt(0, 0.1, 0).focal(u.mm(35)));
 ''')
P('G-05','scatter','Scatter: a forest by density','Geometry','scene.scatter places instances where a density field allows — evaluated on the CPU at build time, from the same expression graph.',
 ['Raise the count to 400','Make the clearing larger','Use a different seed'], ['architecture'],
 '''
 # Scatter: a forest by density

 ```js
 scene.scatter({ count: 220, seed: 7, area: [16, 16], density: p => …, place: (i, { rng, P }) => tree(rng).at(P[0], 0, P[2]) })
 ```

 `density` is a **field** — the same kind of expression a material uses — but here it is evaluated on the CPU, at build time, by the expression interpreter. Candidate points are kept with probability equal to the density: a clearing in the middle, thinning at the edges.

 `place` is a build lambda: it gets a seeded `rng` (same seed → same forest), and must not use `Math.random` (**W501**).
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const bark = material.pbr().baseColor('#4a3424').roughness(0.9);
 const leaves = material.pbr().roughness(0.8).baseColor(p => fx.ramp(p.instance.random, [[0, '#1f3a1c'], [1, '#4d6a2a']]));

 const tree = rng => {
   const h = 0.8 + rng() * 1.2, r = 0.25 + rng() * 0.25;
   return scene.group([
     shape.cylinder(0.05, h * 0.5).at(0, h * 0.25, 0).material(bark),
     shape.cone(r, h).at(0, h * 0.75, 0).material(leaves),
   ]);
 };

 const forest = scene.scatter({
   count: 220, seed: 7, area: [16, 16],
   density: p => p.P.xz.length().smoothstep(1.8, 3.2).mul(fx.noise.fbm(p.P.mul(0.4)).add(0.6)),
   place: (i, { rng, P }) => tree(rng).at(P[0], 0, P[2]),
 });

 export default scene()
   .add(forest)
   .add(shape.sphere(0.3).at(0, 0.3, 0).material(material.pbr().baseColor('#b3261e').roughness(0.3)))
   .add(shape.plane().material(material.pbr().baseColor('#5a6a3a').roughness(0.95)))
   .light(light.daylight({ elevation: u.deg(30), azimuth: u.deg(80) }))
   .camera(camera.thinLens().at(0, 4.5, 8).lookAt(0, 0, 0).focal(u.mm(30)));
 ''')
P('G-06','hierarchy','Hierarchy: an orrery','Geometry','Children inherit their parent’s transform: a planet turns around the sun, a moon around the planet, each with its own clock.',
 ['Add a second moon','Tilt the planet’s orbit'], ['architecture'],
 '''
 # Hierarchy: an orrery

 `.child(node)` attaches a node in its parent's frame. Here:

 ```
 sun ─ arm (rotateY: t·0.5) ─ planet (at 1.6 m) ─ arm (rotateY: t·2) ─ moon (at 0.35 m)
 ```

 Each `rotateY` is a field of time, so the transforms move every frame; the host re-packs only the objects whose recipe depends on time. The sun is an emissive sphere *and* a point light at the same place.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const moon = shape.sphere(0.06).at(0.35, 0, 0).material(material.pbr().baseColor(0.6));
 const planet = shape.sphere(0.16).at(1.6, 0, 0).material(material.pbr().baseColor('#2e6fa8').roughness(0.5))
   .child(scene.group([moon]).rotateY(fx.time().mul(2)));
 const arm = scene.group([planet]).rotateY(fx.time().mul(0.5));

 export default scene()
   .add(shape.sphere(0.3).at(0, 0.6, 0).material(material.emissive('#ffcf80', u.nit(4000))).child(arm))
   .light(light.point().at(0, 0.6, 0).power(u.lm(8000)).temperature(u.K(4500)))
   .add(shape.disk(2.4).at(0, 0, 0).material(material.pbr().baseColor(0.25).roughness(0.6)))
   .light(light.env.uniform(u.nit(3)))
   .camera(camera.thinLens().at(0, 2.4, 3.6).lookAt(0, 0.4, 0).focal(u.mm(30)));
 ''')
P('V-01','god-rays','Fog and god rays','Media','Sunlight through three windows into a hazy room: single scattering in a homogeneous medium makes the beams visible.',
 ['Make the haze thicker','Lower the sun so the beams reach the far wall','Set g to 0 and compare'], ['media','monte-carlo'],
 '''
 # Fog and god rays

 The air in this room is a **homogeneous medium**: a scattering coefficient $\\sigma_s$ and absorption $\\sigma_a$ that together set the mean free path $1/\\sigma_t$, plus a **phase function** for the direction of scattering. Henyey–Greenstein with $g = 0.7$ scatters mostly forward, so the beams are brightest when you look toward the sun.

 The path tracer samples a free-flight distance in the medium; at each scattering point it does next-event estimation to the sun. Where the window lets the sun through, that connection succeeds — and the beam appears.
 ''',
 '''
 import { scene, shape, material, light, camera, medium, phase, param, params, units as u } from 'candela';

 const P = params({ mfp: param.length(18).range(4, 80).label('Mean free path (m)').static() });
 const wall = material.pbr().baseColor('#c8bca8').roughness(0.9);
 const room = scene.group([
   shape.box(0.2, 3, 8).at(-3, 1.5, 0).material(wall),                       // right wall (solid)
   shape.box(8, 3, 0.2).at(0, 1.5, -4).material(wall),                       // back wall
   shape.box(8, 0.2, 8.4).at(0, 3.1, 0).material(wall),                      // ceiling
   // left wall with three windows
   shape.box(0.2, 1.0, 8).at(3, 0.5, 0).material(wall),
   shape.box(0.2, 0.8, 8).at(3, 2.6, 0).material(wall),
   ...[-3.5, -1.5, 0.5, 2.5, 4].map(z => shape.box(0.2, 1.2, z === 4 ? 0.8 : 1.2).at(3, 1.6, z === 4 ? 3.6 : z).material(wall)),
 ]);

 export default scene().params(P)
   .add(room)
   .add(shape.plane().material(material.pbr().baseColor('#6a5a48').roughness(0.8)))
   .add(shape.sphere(0.4).at(-0.6, 0.4, -1).material(material.pbr().baseColor('#b3261e').roughness(0.4)))
   .light(light.sun().elevation(u.deg(28)).azimuth(u.deg(80)).illuminance(u.lux(60000)))
   .light(light.sky.physical({ turbidity: 3 }).fromSun().scale(0.2))
   .medium(medium.homogeneous({ albedo: 0.9, meanFreePath: u.m(P.mfp.value), phase: phase.hg(0.7) }))
   .camera(camera.thinLens().at(-2.2, 1.5, 3.6).lookAt(1.0, 1.1, -1.5).focal(u.mm(24)));
 ''', focus='params')
P('V-02','phase','Phase functions','Media','Three volumes of the same density with g = −0.6, 0 and 0.8, lit from behind: forward scattering glows toward the light.',
 ['Move the light in front of the volumes','Which g would you use for clouds? For milk?'], ['media'],
 '''
 # Phase functions

 The **Henyey–Greenstein** phase function has one parameter, the mean cosine $g$:

 $$p(\\theta) = \\frac{1}{4\\pi}\\,\\frac{1 - g^2}{(1 + g^2 - 2g\\cos\\theta)^{3/2}}$$

 $g > 0$ scatters forward (clouds ≈ 0.85, fog ≈ 0.7), $g < 0$ backward (some dusts), $g = 0$ evenly. The three boxes hold the same density and albedo; only $g$ differs. The light is behind them, so the forward-scattering box on the right glows brightest at its edges toward the light, and the back-scattering one on the left stays dim from this side.

 Each box is a **heterogeneous medium** with a constant density — a bounded volume, so the scene can hold several.
 ''',
 '''
 import { scene, shape, material, light, camera, medium, phase, fx, units as u } from 'candela';

 const vol = (x, g) => medium.heterogeneous({
   density: fx.field(p => 6), bounds: shape.box(0.8, 1.2, 0.8).at(x, 0.65, 0), albedo: 0.95, phase: phase.hg(g),
 });

 export default scene()
   .medium(vol(-1.1, -0.6), vol(0, 0), vol(1.1, 0.8))
   .add(shape.rect(3, 0.8).at(0, 1.4, -1.8).facing(0, 0.65, 0).emit(light.area().power(u.lm(20000)).temperature(u.K(5500))))
   .add(shape.plane(30).material(material.pbr().baseColor(0.15).roughness(0.9)))
   .light(light.env.uniform(u.nit(2)))
   .camera(camera.thinLens().at(0, 1.0, 3.6).lookAt(0, 0.65, 0).focal(u.mm(35)));
 ''')
P('V-03','smoke','Smoke: a heterogeneous volume','Media','Density from fractal noise inside a box, delta-tracked against a majorant found by interval arithmetic.',
 ['Make the smoke denser at the bottom','Give it a warm emission like a fire'], ['media','invariants'],
 '''
 # Smoke: a heterogeneous volume

 ```js
 medium.heterogeneous({ density: fx.field(p => …), bounds: shape.box(…), albedo: 0.9, phase: phase.hg(0.3) })
 ```

 A varying density cannot be sampled in closed form. **Delta tracking** samples distances against a constant *majorant* $\\bar\\sigma \\ge \\sigma_t(\\mathbf x)$ everywhere, and accepts a collision with probability $\\sigma_t(\\mathbf x)/\\bar\\sigma$. The result is unbiased if — and only if — the majorant really bounds the density.

 You don't supply it. The compiler runs **interval arithmetic** over the density's expression graph across the bounding box and proves a bound (see **I451** in the Console). A density it can't bound is **E450**, not a silent bias.
 ''',
 '''
 import { scene, shape, material, light, camera, medium, phase, fx, param, params, units as u } from 'candela';

 const P = params({ density: param.float(14).range(1, 40).label('Density').static() });
 const D = P.density.value;
 const smoke = medium.heterogeneous({
   density: fx.field(p => {
     const q = p.P.sub(fx.vec3(0, 0.9, 0));
     const w = q.y.add(0.9).div(1.8).mul(0.3).add(0.18);                  // the plume widens as it rises
     const plume = q.xz.length().smoothstep(w, w.mul(0.3)).mul(q.y.smoothstep(0.85, 0.4)).mul(q.y.smoothstep(-0.9, -0.75));
     const n = fx.noise.fbm(p.P.mul(3).add(fx.vec3(0, -0.6, 0)), { octaves: 5 }).add(0.45).max(0);
     return plume.mul(n).mul(D);
   }),
   bounds: shape.box(1.4, 1.8, 1.4).at(0, 0.9, 0),
   albedo: 0.92, phase: phase.hg(0.3),
 });

 export default scene().params(P)
   .medium(smoke)
   .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.9)))
   .light(light.sun().elevation(u.deg(35)).azimuth(u.deg(120)).illuminance(u.lux(30000)))
   .light(light.env.gradient({ top: '#8aa0c0', bottom: '#2a2a2a', intensity: u.nit(600) }))
   .camera(camera.thinLens().at(0, 1.2, 4.2).lookAt(0, 0.9, 0).focal(u.mm(35)));
 ''', focus='console')
P('V-04','cloud','A cloud','Media','A bright, nearly white volume: high albedo, strong forward scattering, and many scattering events per path.',
 ['Make it a storm cloud (lower albedo, denser)','Put the sun behind the cloud for a silver lining'], ['media'],
 '''
 # A cloud

 Clouds are almost pure scatterers — albedo ≈ 0.99 — with a strongly forward-peaked phase function ($g \\approx 0.85$). Light inside them takes **dozens** of scattering events before leaving, which is why they look white and soft rather than grey and sharp.

 Scattering events inside a volume have their own budget in the path tracer (up to 256), separate from surface bounces: a path that has hit only one surface can scatter 50 times inside the cloud. Russian roulette ends the walk when its throughput gets small.

 > **Try it.** Ask the agent to put the sun behind the cloud: the edges light up (the *silver lining*), because forward scattering sends light along the thin edge toward you.
 ''',
 '''
 import { scene, shape, material, light, camera, medium, phase, fx, units as u } from 'candela';

 const puff = (p, c, r) => fx.float(r).sub(p.P.sub(fx.vec3(...c)).length()).div(r).max(0);
 const cloud = medium.heterogeneous({
   density: fx.field(p => {
     const body = fx.max(fx.max(puff(p, [0, 2.0, 0], 1.0), puff(p, [0.9, 1.8, 0.2], 0.75)), fx.max(puff(p, [-0.9, 1.75, -0.1], 0.7), puff(p, [0.2, 2.6, 0], 0.6)));
     const n = fx.noise.fbm(p.P.mul(2.2), { octaves: 5 }).mul(0.8).add(0.6);
     return body.mul(n).smoothstep(0.05, 0.4).mul(18);
   }),
   bounds: shape.box(4, 2.4, 2.4).at(0, 2.0, 0),
   albedo: 0.99, phase: phase.hg(0.85),
 });

 export default scene()
   .medium(cloud)
   .light(light.sun().elevation(u.deg(30)).azimuth(u.deg(150)))
   .light(light.sky.physical({ turbidity: 2.2 }).fromSun())
   .add(shape.plane().material(material.pbr().baseColor('#5a6a3a').roughness(0.95)))
   .camera(camera.thinLens().at(0, 1.6, 7.5).lookAt(0, 2.0, 0).focal(u.mm(35)));
 ''')
P('V-05','glass-of-water','Water, wine and milk','Media','Three glasses: clear water absorbs a little red, wine absorbs most of it, milk scatters everything.',
 ['Make the wine a rosé','Dilute the milk'], ['media'],
 '''
 # Water, wine and milk

 Three liquids, three interior media, one glass:

 | liquid | medium | what it does |
 | --- | --- | --- |
 | water | absorbing, faint cyan after 1 m | almost clear in a glass |
 | wine | absorbing, deep red after 15 cm | transmits mostly red |
 | milk | scattering, albedo 0.99, mean free path 0.5 mm | white and opaque, soft-edged |

 Absorbing media use Beer–Lambert along the whole segment (no sampling noise); scattering ones random-walk. The glass walls are a separate dielectric shell around each liquid.
 ''',
 '''
 import { scene, shape, material, medium, phase, light, camera, units as u } from 'candela';

 const glass = material.glass({ ior: 1.5 });
 const liquid = m => material.glass({ ior: 1.34 }).interior(m);
 const water = liquid(medium.absorbing({ tint: [0.82, 0.96, 0.97], distance: u.m(1) }));
 const wine = liquid(medium.absorbing({ tint: '#c01828', distance: u.cm(15) }));
 const milk = liquid(medium.homogeneous({ albedo: 0.995, meanFreePath: u.mm(0.5), phase: phase.hg(0.6) }));

 const cup = (x, m) => scene.group([
   shape.cylinder(0.2, 0.5).at(x, 0.25, 0).material(glass),
   shape.cylinder(0.185, 0.36).at(x, 0.2, 0).material(m),
 ]);

 export default scene()
   .add(cup(-0.5, water), cup(0, wine), cup(0.5, milk))
   .add(shape.plane(30).material(material.pbr().baseColor(0.75).roughness(0.6)))
   .add(shape.rect(4, 2).at(0, 1, -1).rotateX(u.deg(90)).material(material.pbr().baseColor(0.75).roughness(0.6)))
   .light(light.env.studio({ intensity: u.nit(900) }))
   .camera(camera.thinLens().at(0, 0.6, 2.4).lookAt(0, 0.25, 0).focal(u.mm(45)));
 ''')
