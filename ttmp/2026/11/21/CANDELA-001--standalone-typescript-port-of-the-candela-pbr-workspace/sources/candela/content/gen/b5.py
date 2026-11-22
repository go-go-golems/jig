from mk import P
P('W-01','behaviours','Behaviours','Live','.behavior((self, { t, dt }) => …) runs on the host every frame and moves things by transform overrides — a repack, never a recompile.',
 ['Make the ball bounce higher','Give the lamp a behaviour that swings it','Pause the clock and step it with the agent'], ['architecture'],
 '''
 # Behaviours

 A behaviour is plain JavaScript that runs **every frame on the host**:

 ```js
 shape.sphere(0.2).id('ball').behavior((self, { t }) => { self.position.y = 0.2 + Math.abs(Math.sin(t * 3)) * 0.8; })
 ```

 `self.position`, `self.rotation` and `self.scale` write **overrides** for that node's transform. The scene is re-packed (objects, lights, BVH refit) — a millisecond — and the kernel stays as it is. Behaviours need an `.id()` so their state survives rebuilds.

 Use behaviours for motion that is easiest to write as code: physics-ish bounces, following another object, reacting to `world`. Use **fields of time** (`fx.time()`) for motion that is a simple function of $t$ — those can also run inside the kernel.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const g = 9.81, h0 = 1.0;
 export default scene()
   .add(shape.sphere(0.18).at(-1, 0.18, 0).id('ball').material(material.plastic('#d03a2a', 0.2))
     .behavior((self, { t }) => {                                          // a bouncing ball: a parabola, period √(8h/g)
       const T = Math.sqrt(8 * h0 / g), s = (t % T) - T / 2;
       self.position.y = 0.18 + h0 - 0.5 * g * s * s;
     }))
   .add(shape.cone(0.22, 0.4).at(0.2, 0.2, 0).rotateX(u.deg(180)).id('top').material(material.pbr().baseColor('#e0b040').roughness(0.3))
     .behavior((self, { t, dt }) => { self.rotation.y += dt * 8; self.rotation.z = 0.15 * Math.sin(t * 1.3); }))
   .add(shape.sphere(0.12).at(1.2, 1.0, 0).id('bob').material(material.metal('brass', { roughness: 0.2 }))
     .behavior((self, { t }) => {                                          // a pendulum, small-angle: θ = θ0 cos(√(g/L) t)
       const L = 0.9, th = 0.5 * Math.cos(Math.sqrt(g / L) * t);
       self.position.x = 1.2 + L * Math.sin(th); self.position.y = 1.9 - L * Math.cos(th);
     }))
   .add(shape.cylinder(0.02, 0.1).at(1.2, 1.95, 0).material(material.metal('Fe')))
   .add(shape.plane(30).material(material.pbr().baseColor(0.5).roughness(0.7)))
   .light(light.daylight({ elevation: u.deg(50), azimuth: u.deg(30) }))
   .camera(camera.thinLens().at(0.1, 1.1, 3.2).lookAt(0.1, 0.75, 0).focal(u.mm(40)));
 ''')
P('W-02','world','Talk to the world','Live','A room built for the agent: every object has an id or a tag, so it can be read and patched live with world.$ and world.$$.',
 ['Dim the lamp to 400 lm and make it warmer','Make every .fruit a little glossier','Move the bowl to the left edge of the table and take a screenshot'], ['agent','architecture'],
 '''
 # Talk to the world

 Builders are immutable values; the **world** is the live, mutable view of what is on screen. The agent (and you, in the console of the agent view) can read and write it:

 ```js
 world.$('#lamp').power                 // → 900 lm
 world.$('#lamp').power = 400           // a value patch: repack, no rebuild
 world.$$('.fruit').forEach(f => f.material.roughness = 0.2)
 world.$('#bowl').position = [-0.5, 0.82, 0]
 ```

 Each write becomes a **patch** recorded in the Console with its cost — *value* (repack) or *structure* (a cached recompile) — and folds back into the scene, so the code view and the image never disagree.

 > **Try it.** Open the **Agent** view and ask: *"dim the lamp to 400 lm, make it warmer, and show me"*.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const wood = material.pbr().roughness(0.5).coat(1).coatRoughness(0.15).baseColor(p => fx.ramp(fx.noise.fbm(p.P.mul(fx.vec3(2, 2, 24))).mul(0.5).add(0.5), [[0, '#5a3820'], [1, '#9a6a40']]));
 const fruit = (c, x, z, r = 0.08) => shape.sphere(r).at(x, 0.86 + r, z).tag('fruit').material(material.pbr().baseColor(c).roughness(0.45).coat(0.5));

 export default scene()
   .add(shape.box(1.6, 0.05, 0.9).at(0, 0.8, 0).id('table').material(wood))
   .add(shape.cylinder(0.04, 0.8).at(-0.7, 0.4, -0.35).material(wood), shape.cylinder(0.04, 0.8).at(0.7, 0.4, -0.35).material(wood))
   .add(shape.cylinder(0.04, 0.8).at(-0.7, 0.4, 0.35).material(wood), shape.cylinder(0.04, 0.8).at(0.7, 0.4, 0.35).material(wood))
   .add(shape.cylinder(0.2, 0.06).at(0.1, 0.855, 0).id('bowl').material(material.ceramic('#e8e4da')))
   .add(fruit('#e8a020', 0.05, 0.02), fruit('#c8281c', 0.18, -0.06), fruit('#7aa030', 0.12, 0.1, 0.07), fruit('#e8a020', -0.45, 0.2))
   .add(shape.cylinder(0.12, 0.02).at(-0.5, 0.835, -0.25).material(material.metal('brass', { roughness: 0.3 })))
   .add(shape.cylinder(0.012, 0.45).at(-0.5, 1.06, -0.25).material(material.metal('brass', { roughness: 0.3 })))
   .light(light.point().id('lamp').at(-0.5, 1.33, -0.25).power(u.lm(900)).temperature(u.K(3000)).radius(0.05))
   .add(shape.rect(6, 3).at(0, 1.5, -1.2).rotateX(u.deg(90)).id('wall').material(material.pbr().baseColor('#b8b0a0').roughness(0.9)))
   .add(shape.plane(30).id('floor').material(material.pbr().baseColor('#6a5a48').roughness(0.7)))
   .light(light.env.uniform(u.nit(6)))
   .camera(camera.thinLens().at(0.3, 1.5, 2.2).lookAt(0, 0.85, 0).focal(u.mm(35)));
 ''', focus='agent')
P('W-03','costs','What does a change cost?','Live','Three sliders, three costs: a uniform, a repack, a rebuild. Watch the status bar as you move each.',
 ['Which slider recompiles?','Make the count slider dynamic — why is that impossible?'], ['architecture','gpu'],
 '''
 # What does a change cost?

 | slider | what it changes | cost |
 | --- | --- | --- |
 | **Roughness** | a material input | a uniform write: the next frame |
 | **Height** | a transform (via `.map`) | a repack of object data |
 | **Count** | how many objects exist | a rebuild — the scene's structure changed (static) |

 Count must be static: the number of objects decides the BVH and the data layout. The compiler won't let a dynamic param decide structure — `.static()` says so explicitly, and the kernel cache makes a revisited count instant.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({
   rough: param.float(0.3).range(0, 1).label('Roughness'),
   lift: param.float(0.4).range(0, 1.5).label('Height (m)'),
   n: param.int(5).range(1, 12).label('Count').static(),
 });
 const m = material.pbr().baseColor('#2e6fa8').roughness(P.rough);
 const n = P.n.value;

 export default scene().params(P)
   .add(scene.group(g => { for (let i = 0; i < n; i++) g.add(shape.sphere(0.18).at((i - (n - 1) / 2) * 0.42, 0.18, 0).material(m)); }))
   .add(shape.torus(0.3, 0.06).at(0, P.lift.map(h => 0.2 + h), -0.6).rotateX(u.deg(70)).material(material.metal('Au', { roughness: 0.2 })))
   .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
   .light(light.env.studio({ intensity: u.nit(900) }))
   .camera(camera.thinLens().at(0, 1.2, 3.4).lookAt(0, 0.35, -0.2).focal(u.mm(40)));
 ''', focus='params')
P('W-04','gyroscope','Kinetic sculpture','Live','Nested gimbals turning at incommensurate rates: transforms that are fields of time, composed through the hierarchy.',
 ['Make the outer ring stop','Add a fourth ring'], ['architecture'],
 '''
 # Kinetic sculpture

 Three rings, each a child of the previous, each turning about a different axis with `fx.time()`. The innermost ring's world transform is the product of all three rotations — evaluated every frame on the host while the kernel only sees the resulting matrices.

 The rates ($1$, $\\sqrt 2$, $\\varphi$ rad/s) are mutually irrational, so the sculpture never repeats.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const gold = material.metal('Au', { roughness: 0.18 });
 const steel = material.metal('Fe', { roughness: 0.25 });
 const ring = (R, m) => shape.torus(R, 0.025).material(m);

 const inner = scene.group([ring(0.36, gold), shape.sphere(0.12).material(material.glass({ ior: 1.5, absorb: '#c03020', distance: u.cm(10) }))]).rotateX(fx.time().mul(1.618).add(0.9));
 const mid = scene.group([ring(0.48, steel), inner]).rotateZ(fx.time().mul(Math.SQRT2).add(0.6));
 const outer = scene.group([ring(0.6, gold), mid]).rotateX(u.deg(70)).rotateY(fx.time());

 export default scene()
   .add(outer.at(0, 1.0, 0))
   .add(shape.cylinder(0.02, 0.4).at(0, 0.2, 0).material(steel))
   .add(shape.cylinder(0.3, 0.04).at(0, 0.02, 0).material(material.pbr().baseColor(0.06).roughness(0.3)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.6)))
   .light(light.env.studio({ intensity: u.nit(900), rotate: u.deg(20) }))
   .camera(camera.thinLens().at(0, 1.3, 3).lookAt(0, 0.9, 0).focal(u.mm(45)));
 ''')
P('R-01','cornell','The Cornell box','Scenes','The test scene of global illumination since 1984: red and green walls bleeding colour onto white, under one ceiling light.',
 ['Swap the tall block for a mirror box','Replace the light with a sphere light of the same power'], ['monte-carlo','renderer'],
 '''
 # The Cornell box

 Built at Cornell in 1984 (Goral, Torrance, Greenberg, Battaile) to compare rendering against a real, measured box. Everything you see that isn't directly under the light is **indirect**: the soft shadows, the red and green glow on the blocks, the light on the ceiling.

 The reflectances here approximate the original's measured paints (white ≈ 0.73, red ≈ 0.55 in red, green ≈ 0.45 in green). The light is a 0.5 m × 0.4 m panel of 6 000 lm at about 3 400 K, like the original's tungsten flood.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const white = material.pbr().baseColor([0.73, 0.71, 0.68]).roughness(1);
 const red = material.pbr().baseColor([0.55, 0.06, 0.05]).roughness(1);
 const green = material.pbr().baseColor([0.12, 0.45, 0.09]).roughness(1);
 const S = 2;

 export default scene()
   .add(shape.rect(S, S).at(0, 0, 0).material(white))
   .add(shape.rect(S, S).at(0, S, 0).rotateX(u.deg(180)).material(white))
   .add(shape.rect(S, S).at(0, S / 2, -S / 2).rotateX(u.deg(90)).material(white))
   .add(shape.rect(S, S).at(-S / 2, S / 2, 0).rotateZ(u.deg(-90)).material(red))
   .add(shape.rect(S, S).at(S / 2, S / 2, 0).rotateZ(u.deg(90)).material(green))
   .add(shape.box(0.6, 1.2, 0.6).at(-0.35, 0.6, -0.3).rotateY(u.deg(17)).material(white))
   .add(shape.box(0.6).at(0.38, 0.3, 0.3).rotateY(u.deg(-17)).material(white))
   .add(shape.rect(0.5, 0.4).at(0, S - 0.001, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(6000)).temperature(u.K(3400))))
   .camera(camera.thinLens().at(0, 1, 4.2).lookAt(0, 1, 0).focal(u.mm(42)));
 ''')
P('R-02','product','Product shot: mug and spoon','Scenes','A glazed mug, a steel spoon and a saucer on a seamless sweep, lit by one big softbox and a rim strip.',
 ['Make the mug matte black','Move the softbox to the other side','Critique this as a product photographer would'], ['sensor'],
 '''
 # Product shot: mug and spoon

 Classic tabletop lighting: a large **softbox** close to the subject for soft, wrapping light and a broad highlight on the glaze; a narrow **strip** behind and to the side for a rim that separates the mug from the sweep. The sweep is a curved backdrop — here a floor plane and a wall joined by a quarter-cylinder — so there is no horizon line.

 Glaze is a clear coat over a coloured diffuse (`material.ceramic`); the spoon is measured iron-chromium (`'Cr'`), slightly rough.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const sweep = material.pbr().baseColor('#d8d4cc').roughness(0.9);
 const glaze = material.ceramic('#2a5a78');
 const mug = scene.group([
   shape.cylinder(0.09, 0.2).at(0, 0.1, 0).material(glaze),
   shape.torus(0.055, 0.015).at(0.1, 0.11, 0).rotateX(u.deg(90)).material(glaze),
   shape.cylinder(0.08, 0.005).at(0, 0.198, 0).material(material.pbr().baseColor('#3e2a1c').roughness(0.05).coat(1)),   // coffee
 ]);

 export default scene()
   .add(shape.cylinder(0.16, 0.012).at(0, 0.006, 0).material(material.ceramic('#ece8e0')))
   .add(mug.at(0, 0.012, 0))
   .add(shape.capsule(0.008, 0.16).at(0.17, 0.016, 0.1).rotateZ(u.deg(90)).rotateY(u.deg(30)).material(material.metal('Cr', { roughness: 0.12 })))
   .add(shape.plane(10).material(sweep))
   .add(shape.cylinder(0.6, 3).at(0, 0.6, -0.6).rotateZ(u.deg(90)).material(sweep))
   .add(shape.rect(3, 2).at(0, 1.6, -1.2).rotateX(u.deg(90)).material(sweep))
   .add(shape.rect(0.9, 0.9).at(-0.7, 0.6, 0.5).facing(0, 0.1, 0).emit(light.area().power(u.lm(5000)).temperature(u.K(5500))))
   .add(shape.rect(0.12, 0.8).at(0.5, 0.45, -0.4).facing(0, 0.1, 0).emit(light.area().power(u.lm(1500)).temperature(u.K(6000))))
   .light(light.env.uniform(u.nit(15)))
   .camera(camera.thinLens().at(0.15, 0.32, 0.9).lookAt(0.02, 0.1, 0).focal(u.mm(70)).fstop(8));
 ''')
P('R-03','still-life','Still life by a window','Scenes','Fruit, a bottle, a cloth and a wooden table in a shaft of window light: subsurface, absorption, sheen and a varnished coat together.',
 ['Change the time of day — warmer light, longer shadow','Replace the wine with olive oil'], ['renderer','media'],
 '''
 # Still life by a window

 One window (a large area light at 5 600 K, outside the frame) and a dim warm room fill. The materials each do a different kind of light transport:

 - **oranges and the apple** — subsurface volumes (light enters, scatters, exits nearby);
 - **the bottle** — clear glass around an absorbing liquid (Beer–Lambert);
 - **the cloth** — a sheen lobe over a diffuse base;
 - **the table** — wood grain under a varnish coat.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, fx, units as u } from 'candela';

 const wood = material.pbr().roughness(0.6).coat(1).coatRoughness(0.2).coatColor('#e0b070')
   .baseColor(p => fx.ramp(fx.noise.fbm(p.P.mul(fx.vec3(30, 2, 2)), { octaves: 4 }).mul(0.5).add(0.5), [[0, '#4a2c18'], [1, '#8a5a30']]));
 const orange = material.subsurface({ albedo: [0.95, 0.5, 0.1], meanFreePath: u.mm(3), roughness: 0.5 });
 const apple = material.subsurface({ albedo: [0.75, 0.12, 0.08], meanFreePath: u.mm(2), roughness: 0.25 });
 const cloth = material(bsdf.layer(bsdf.sheen({ color: '#e8d0b0', roughness: 0.4 }), bsdf.lambert('#7a1e2a')));

 export default scene()
   .add(shape.box(2.2, 0.06, 1.2).at(0, 0.75, 0).material(wood))
   .add(shape.roundedBox(0.7, 0.02, 0.5, 0.01).at(0.15, 0.79, 0.05).rotateY(u.deg(12)).material(cloth))
   .add(shape.sphere(0.07).at(0.1, 0.87, 0.05).material(orange), shape.sphere(0.065).at(0.26, 0.865, 0.12).material(orange))
   .add(shape.sphere(0.07).scale(1, 0.9, 1).at(0.0, 0.863, 0.2).material(apple))
   .add(shape.cylinder(0.07, 0.3).at(-0.3, 0.93, -0.15).material(material.glass({ ior: 1.5 })))
   .add(shape.cylinder(0.065, 0.2).at(-0.3, 0.88, -0.15).material(material.glass({ ior: 1.34, absorb: '#6a0a14', distance: u.cm(2) })))
   .add(shape.cylinder(0.025, 0.12).at(-0.3, 1.14, -0.15).material(material.glass({ ior: 1.5 })))
   .add(shape.rect(1.2, 1.4).at(-1.6, 1.5, 0.3).facing(0, 0.8, 0).emit(light.area().power(u.lm(20000)).temperature(u.K(5600))))
   .add(shape.rect(5, 3).at(0, 1.5, -0.9).rotateX(u.deg(90)).material(material.pbr().baseColor('#6a6050').roughness(0.9)))
   .add(shape.plane(30).material(material.pbr().baseColor('#3a3028').roughness(0.8)))
   .light(light.env.uniform(u.nit(3)).temperature(u.K(3000)))
   .camera(camera.thinLens().at(0.4, 1.15, 1.5).lookAt(-0.02, 0.88, 0).focal(u.mm(55)).fstop(4));
 ''')
P('R-04','desert','Dunes at golden hour','Scenes','Sand dunes as a heightfield of warped sine ridges, a low sun, and the sky’s blue in every shadow.',
 ['Raise the sun to noon','Add a lone cactus','Make the dunes taller'], ['renderer','units'],
 '''
 # Dunes at golden hour

 Dunes are long, asymmetric ridges: a gentle windward slope and a steep slip face. A sine wave warped by low-frequency noise makes a convincing field of them:

 ```js
 h = sin(x · k + fbm(p) · a) shaped by pow(…, 1.5)
 ```

 At 8° elevation, the sun is warm (air mass ≈ 7) and every slip face falls into shadow — lit only by the blue sky. The sand is fine ripples on top: a small **bump** field along the wind direction.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const dunes = shape.heightfield(p => {
   const q = p.P.mul(0.18);
   const w = q.x.mul(1.6).add(q.z.mul(0.4)).add(fx.noise.fbm(q.mul(0.6), { octaves: 3 }).mul(3.2));
   return w.sin().mul(0.5).add(0.5).pow(1.5);
 }, { size: 80, height: 3 });
 const ripples = p => p.P.x.mul(28).add(fx.noise.perlin(p.P.mul(2)).mul(3)).sin().mul(0.004);
 const sand = material.pbr().baseColor('#d2a878').roughness(0.9).normal(fx.bump(ripples, 1));

 export default scene()
   .add(dunes.material(sand))
   .add(shape.plane().material(sand))
   .light(light.sun().elevation(u.deg(8)).azimuth(u.deg(250)))
   .light(light.sky.physical({ turbidity: 4 }).fromSun())
   .camera(camera.thinLens().at(0, 7, 26).lookAt(0, 1, 0).focal(u.mm(40)));
 ''')
P('R-05','jewellery','Jewellery on velvet','Scenes','A gold ring set with a diamond, a pearl with a nacre film and a silver chain, on black velvet under small bright lights. Spectral.',
 ['Swap the gold for platinum','Make the pearl pink'], ['renderer'],
 '''
 # Jewellery on velvet

 - **Gold** — measured complex IOR, slightly rough;
 - **Diamond** — Sellmeier dispersion, traced spectrally for fire;
 - **Pearl** — a white diffuse base under a thin film (nacre: layers of aragonite ≈ 500 nm thick) and a glossy coat, giving its soft iridescence;
 - **Velvet** — a sheen lobe that glows at grazing angles, so the jewellery sits on a dark ground with bright edges.

 Small lights make the highlights and the fire: a big soft source would wash them out.
 ''',
 '''
 import { scene, shape, material, bsdf, ior, light, camera, engine as E, fx, units as u } from 'candela';

 const diamond = material(bsdf.dielectric({ ior: ior.sellmeier({ B: [0.3306, 4.3356, 0], C: [0.1750 ** 2, 0.1060 ** 2, 0] }) }));
 const gem = shape.sdf(p => { const q = p.P.abs(); return fx.max(q.x.add(q.y.mul(1.35)).add(q.z).sub(0.05).mul(0.55), p.P.y.sub(0.02)); }, { bound: 0.07 });
 const pearl = material.pbr().baseColor('#f0ebe2').roughness(0.25).coat(1).coatRoughness(0.08).thinFilm(480).unchecked('W330');
 const velvet = material(bsdf.layer(bsdf.sheen({ color: '#6a6a7a', roughness: 0.3 }), bsdf.lambert('#34343c')));
 const chain = scene.group(g => { for (let i = 0; i < 18; i++) { const a = i * 0.33; g.add(shape.torus(0.012, 0.003).at(-0.18 + Math.cos(a) * 0.09, 0.004, 0.08 + i * 0.015).rotateY(a * 2).rotateX(u.deg(i % 2 ? 90 : 0)).material(material.metal('Ag', { roughness: 0.1 }))); } });

 export default scene()
   .add(shape.torus(0.05, 0.008).at(0, 0.058, 0).rotateX(u.deg(90)).rotateY(u.deg(25)).material(material.metal('Au', { roughness: 0.1 })))
   .add(gem.at(0, 0.152, 0).rotateY(u.deg(25)).material(diamond))
   .add(shape.sphere(0.022).at(0.1, 0.022, 0.07).material(pearl))
   .add(chain)
   .add(shape.plane(10).material(velvet))
   .light(light.point().at(-0.4, 0.6, 0.4).power(u.lm(1500)).temperature(u.K(5600)).radius(0.01))
   .light(light.point().at(0.5, 0.4, 0.2).power(u.lm(900)).temperature(u.K(5600)).radius(0.01))
   .light(light.env.studio({ intensity: u.nit(40) }))
   .camera(camera.thinLens().at(0.1, 0.2, 0.55).lookAt(0.0, 0.08, 0.02).focal(u.mm(90)).fstop(8));

 export const engine = E.offline().spectral();
 ''')
P('R-06','billiards','Billiards','Scenes','Coated balls on green felt under a low lamp: a clear coat makes the highlights, sheen makes the felt read as cloth.',
 ['Rack the balls into a triangle','Lower the lamp'], ['renderer'],
 '''
 # Billiards

 - **Balls** — phenolic resin: a coloured base under a smooth clear coat. The coat gives each ball a sharp reflection of the lamp; the base gives its colour.
 - **Felt** — wool cloth: a sheen layer over a green diffuse. Fibres catch the light at grazing angles, so the table looks lighter toward the far end.
 - **Lamp** — a single overhead spot with a soft edge, aimed at the table; the room falls off into darkness.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, units as u } from 'candela';

 const felt = material(bsdf.layer(bsdf.sheen({ color: '#a0c8a0', roughness: 0.45 }), bsdf.lambert('#1a5a2a')));
 const ball = c => material.pbr().baseColor(c).roughness(0.3).coat(1).coatRoughness(0.01);
 const cols = ['#e8c020', '#1a40b0', '#c0201a', '#5a1a7a', '#e06010', '#1a6a2a', '#7a1a1a', '#323232'];
 const R = 0.0286;

 export default scene()
   .add(shape.box(2.54, 0.04, 1.27).at(0, 0.78, 0).material(felt))
   .add(cols.map((c, i) => shape.sphere(R).at(0.3 + (i % 4) * 0.07, 0.8 + R, -0.12 + Math.floor(i / 4) * 0.08 + (i % 4) * 0.012).material(ball(c))))
   .add(shape.sphere(R).at(-0.4, 0.8 + R, 0.05).material(ball('#f2eee4').unchecked('W330')))
   .add(shape.box(2.74, 0.1, 0.12).at(0, 0.8, 0.69).material(material.pbr().baseColor('#4c2c18').roughness(0.4).coat(1)))
   .add(shape.box(2.74, 0.1, 0.12).at(0, 0.8, -0.69).material(material.pbr().baseColor('#4c2c18').roughness(0.4).coat(1)))
   .light(light.spot().at(0, 1.9, 0).aim(0, 0.8, 0).power(u.lm(5000)).cone(u.deg(45)).softEdge(u.deg(15)).temperature(u.K(3200)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.06)))
   .light(light.env.uniform(u.nit(1)))
   .camera(camera.thinLens().at(-1.2, 1.25, 1.1).lookAt(0.15, 0.8, 0).focal(u.mm(45)).fstop(4));
 ''')
P('R-07','colorchecker','A colour chart in daylight','Scenes','The 24 patches of a classic colour checker, at their published sRGB values, photographed at EV 14.5 under a physical sun and sky.',
 ['Meter the white and black patches: what is their contrast?','Switch the tone map to Linear and compare the neutrals'], ['sensor','exposure'],
 '''
 # A colour chart in daylight

 A colour checker is how photographers check that a pipeline is honest: known reflectances in, known colours out. These are the 24 patches at their published average sRGB values, converted to linear reflectance by the sRGB transfer curve.

 The bottom row is a neutral scale from white (≈ 0.90) to black (≈ 0.03) — about five stops. With a physical camera (f/8, 1/250 s, ISO 100 → EV 14) under the sun, the third neutral patch (≈ 0.19) lands near middle grey.

 > **Try it.** Alt-click the white and black patches to read their luminances.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const patches = [
   '#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa',
   '#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e',
   '#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1',
   '#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434',
 ];
 const S = 0.1, G = 0.012;
 const chart = scene.group(patches.map((c, i) => shape.box(S, S, 0.004).at((i % 6 - 2.5) * (S + G), (1.5 - Math.floor(i / 6)) * (S + G), 0.003)
   .material(material.pbr().baseColor(c).roughness(0.85).unchecked('W330'))));

 export default scene()
   .add(scene.group([shape.box(6 * (S + G) + G, 4 * (S + G) + G, 0.004).material(material.pbr().baseColor(0.035).roughness(0.9)), chart]).at(0, 0.5, 0).rotateX(u.deg(-12)))
   .add(shape.plane().material(material.pbr().baseColor('#6a6a5a').roughness(0.9)))
   .light(light.sun().elevation(u.deg(50)).azimuth(u.deg(160)))
   .light(light.sky.physical({ turbidity: 2.5 }).fromSun())
   .camera(camera.thinLens().at(0, 0.62, 1.3).lookAt(0, 0.5, 0).focal(u.mm(60)).fstop(8).shutter(1 / 250).iso(100));
 ''')
P('R-08','zen-garden','Zen garden','Scenes','Raked gravel around three stones: the rake lines are a heightfield of rings around each stone, blended by distance.',
 ['Add a fourth stone','Make the light late afternoon'], ['renderer'],
 '''
 # Zen garden

 The gravel is a heightfield whose ridges follow the rake: straight lines far from the stones, concentric rings near them. For each point, the nearest stone's distance $d$ gives ring ridges $\\sin(k d)$; a smooth blend toward straight ridges $\\sin(k x)$ happens as $d$ grows.

 The stones are distance fields too — squashed spheres with fractal displacement — and the moss on them is the same up-facing-and-noisy rule as the fragment preset.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const stones = [[-1.2, -0.4, 0.45], [0.9, 0.3, 0.35], [0.3, -1.3, 0.25]];
 const gravel = shape.heightfield(p => {
   let near = fx.float(9);
   for (const [x, z] of stones) near = fx.min(near, p.P.xz.sub(fx.vec2(x, z)).length());
   const rings = near.mul(40).sin(), lines = p.P.z.mul(40).sin();
   return fx.mix(rings, lines, near.smoothstep(0.8, 1.3)).mul(0.5).add(0.5);
 }, { size: 8, height: 0.015 });
 const rock = (r) => shape.sdf(p => p.P.div(fx.vec3(1, 0.6, 0.85)).length().sub(r).add(fx.noise.fbm(p.P.mul(5), { octaves: 4 }).mul(r * 0.15)).mul(0.6), { bound: r * 1.3 });
 const stone = material.pbr().roughness(0.8).baseColor(p => fx.mix(fx.color('#6a645c'), fx.color('#3d5a1e'), p.N.y.smoothstep(0.5, 0.9).mul(fx.noise.fbm(p.P.mul(8)).add(0.5)).smoothstep(0.45, 0.55)));

 export default scene()
   .add(gravel.material(material.pbr().baseColor('#bdb6a8').roughness(0.95)))
   .add(stones.map(([x, z, r]) => rock(r).at(x, r * 0.35, z).material(stone)))
   .light(light.sun().elevation(u.deg(25)).azimuth(u.deg(120)))
   .light(light.sky.physical({ turbidity: 3 }).fromSun())
   .camera(camera.thinLens().at(0.4, 2.6, 3.8).lookAt(0, 0, -0.3).focal(u.mm(35)));
 ''')
P('R-09','museum','Marble in a museum','Scenes','A marble bust on a plinth under a narrow spotlight, against a dark wall: subsurface glow at the edges, a pool of light on the floor.',
 ['Widen the spot','Make the bust bronze'], ['media','renderer'],
 '''
 # Marble in a museum

 Statuary marble is translucent: light enters a few millimetres and scatters before leaving, which softens every shadow edge and gives thin parts a glow. The bust is a **subsurface** material (albedo 0.97, mean free path 8 mm) — the head, nose and shoulders are built from spheres, capsules and a rounded box.

 A single spot (25° cone, 3 000 K) from above and in front, a dark wall, and a faint fill. Exposure is metered for the bust.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const marble = material.subsurface({ albedo: [0.96, 0.95, 0.92], meanFreePath: u.mm(8), roughness: 0.55 });
 const bust = scene.group([
   shape.sphere(0.11).scale(0.85, 1.1, 0.95).at(0, 0.36, 0),
   shape.capsule(0.018, 0.04).at(0, 0.35, 0.095).rotateX(u.deg(-20)),
   shape.cylinder(0.05, 0.12).at(0, 0.22, 0),
   shape.roundedBox(0.36, 0.14, 0.18, 0.06).at(0, 0.12, 0),
 ].map(s => s.material(marble)));

 export default scene()
   .add(shape.box(0.4, 1.0, 0.4).at(0, 0.5, 0).material(material.pbr().baseColor('#36322e').roughness(0.6)))
   .add(bust.at(0, 1.0, 0).id('bust'))
   .add(shape.rect(8, 4).at(0, 2, -1.2).rotateX(u.deg(90)).material(material.pbr().baseColor('#3a2a26').roughness(0.9)))
   .add(shape.plane(30).material(material.pbr().baseColor('#4a4038').roughness(0.4)))
   .light(light.spot().at(0.6, 3, 1.4).aim(0, 1.3, 0).power(u.lm(2500)).cone(u.deg(25)).softEdge(u.deg(6)).temperature(u.K(3000)))
   .light(light.env.uniform(u.nit(0.6)))
   .camera(camera.thinLens().at(0.5, 1.45, 1.6).lookAt(0, 1.3, 0).focal(u.mm(70)).fstop(4).focusOn('#bust'));
 ''')
P('R-10','candlelight','Candlelight','Scenes','Dinner by candlelight: three wax candles, glasses, plates — a scene lit by 36 lumens, metered near EV 4.',
 ['Blow out one candle','Add a fourth candle on the right'], ['units','sensor'],
 '''
 # Candlelight

 A candle emits about **12 lumens** — the *candela* was once defined as the intensity of a standard candle, roughly 1 cd. Three of them light this table. The metered exposure lands near EV 4: eleven stops (2 000 times) less light than a sunny street at EV 15.

 Each flame is a small emissive capsule (what you see) plus a point light inside it (what lights the scene — directly sampled, so the image converges). A pure glow — an emissive surface over a black BSDF — casts no shadow, so the flame doesn't hide its own light. The wax is subsurface: the candles glow near their flames.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const wax = material.subsurface({ albedo: [0.97, 0.92, 0.82], meanFreePath: u.mm(5), roughness: 0.6 });
 const flame = material.emissive('#ffb050', u.nit(12000));
 const candle = (x, z, h) => scene.group([
   shape.cylinder(0.025, h).at(x, 0.8 + h / 2, z).material(wax),
   shape.capsule(0.006, 0.018).at(x, 0.8 + h + 0.018, z).material(flame),
   light.point().at(x, 0.8 + h + 0.02, z).power(u.lm(12)).temperature(u.K(1850)),
 ]);
 const glass = material.glass({ ior: 1.5 });

 export default scene()
   .add(candle(-0.12, -0.05, 0.22), candle(0.0, -0.12, 0.28), candle(0.1, -0.02, 0.18))
   .add(shape.box(1.6, 0.04, 1.0).at(0, 0.78, 0).material(material.pbr().baseColor('#e8e0d0').roughness(0.9).unchecked('W330')))
   .add(shape.cylinder(0.12, 0.01).at(-0.35, 0.805, 0.2).material(material.ceramic()), shape.cylinder(0.12, 0.01).at(0.38, 0.805, 0.22).material(material.ceramic()))
   .add(shape.cylinder(0.035, 0.12).at(-0.2, 0.86, 0.15).material(glass), shape.cylinder(0.035, 0.12).at(0.22, 0.86, 0.12).material(glass))
   .add(shape.rect(6, 3).at(0, 1.5, -1.2).rotateX(u.deg(90)).material(material.pbr().baseColor('#4a3a30').roughness(0.9)))
   .add(shape.plane(30).material(material.pbr().baseColor('#3a2a20').roughness(0.7)))
   .camera(camera.thinLens().at(0.1, 1.08, 0.95).lookAt(0, 0.9, -0.05).focal(u.mm(45)).fstop(2.8));
 ''')
P('D-01','units','Units in practice','Diagnostics','Every quantity in this scene is a string a person would write — "1200 lm", "35 deg", "f/4", "5600 K" — parsed into typed values.',
 ['Change "1200 lm" to "1200 lux" and read the error','What is the canonical unit of each slot?'], ['units','invariants'],
 '''
 # Units in practice

 Every slot has a **dimension** (flux, intensity, illuminance, luminance, length, angle, temperature). Values can come as:

 - typed quantities: `u.lm(1200)`, `u.deg(35)`, `u.mm(50)`;
 - strings: `'1200 lm'`, `'35 deg'`, `'50 mm'`, `'f/4'`, `'5600 K'`;
 - bare numbers, meaning the slot's canonical unit (metres, radians, lumens…).

 A wrong dimension is **E120**, and the message names the conversion you probably meant. Open **Console → Explain** to see every value with its unit.
 ''',
 '''
 import { scene, shape, material, light, camera } from 'candela';

 export default scene()
   .add(shape.sphere('35 cm').at(0, 0.35, 0).material(material.pbr().baseColor('#c8452e').roughness(0.35)))
   .add(shape.box('60 cm').at(-1, 0.3, -0.3).rotateY('30 deg').material(material.pbr().baseColor(0.7)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
   .light(light.point().at(1.2, 1.8, 1.0).power('1200 lm').temperature('3200 K').radius('2 cm'))
   .light(light.spot().at(-1.5, 2.5, 1.5).aim(0, 0.3, 0).power('2000 lm').cone('25 deg').softEdge('5 deg').temperature('5600 K'))
   .light(light.env.uniform('20 nit'))
   .camera(camera.thinLens().at(0, 1.3, 3.6).lookAt(0, 0.35, 0).focal('40 mm').fstop('f/4'));
 ''', focus='console')
P('D-02','stages','Build time, run time: the errors','Diagnostics','Each commented line is a classic mistake at the boundary between JavaScript and the GPU. Uncomment one, run, and read the message.',
 ['Uncomment the E203 line and fix it with .map','Why is Math.random in a group lambda only a warning?'], ['architecture','invariants'],
 '''
 # Build time, run time: the errors

 | line | code | what happened |
 | --- | --- | --- |
 | `p.P.y > 0 ? a : b` | **E202** | JS branching on a field — there is no value yet, only a symbol; use `fx.select(p.P.y.gt(0), a, b)` |
 | `p.uv.x * 10` | **E201** | JS arithmetic on a field; use `.mul(10)` |
 | `P.gloss * 2` | **E203** | JS arithmetic on a param — its value can change after the build; use `P.gloss.mul(2)` (a field) or `P.gloss.map(v => v * 2)` (a host value) |
 | `p.wo` in a heightfield | **E207** | there is no view direction when the geometry is built |
 | `fx.host(…)` in a material | **E710** | a host function cannot run on the GPU |

 The active line uses `Math.random()` inside a group's build lambda: it works, but the scene changes on every build — **W501** suggests the seeded `rng` the lambda already receives.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({ gloss: param.float(0.3).range(0, 1) });

 // fx.pattern(p => (p.P.y > 0 ? 1 : 0));                         // E202
 // fx.pattern(p => p.uv.x * 10);                                 // E201
 // material.pbr().roughness(P.gloss * 2);                        // E203
 // shape.heightfield(p => p.wo.y);                               // E207
 // material.pbr().baseColor(fx.host(p => [Math.random(), 0, 0])); // E710

 const jitter = scene.group(g => { for (let i = 0; i < 5; i++) g.add(shape.sphere(0.15).at((i - 2) * 0.4, 0.15 + Math.random() * 0.3, 0).material(material.pbr().baseColor('#2e6fa8').roughness(P.gloss))); });   // W501

 export default scene().params(P)
   .add(jitter)
   .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
   .light(light.daylight())
   .camera(camera.thinLens().at(0, 1, 3).lookAt(0, 0.3, 0).focal(u.mm(40)));
 ''', focus='console')
P('D-03','contracts','Fragment contracts','Diagnostics','Fragments declare what they need and what they target; the builder checks both at the call, not at render time.',
 ['Uncomment each line and read the error','Write a fragment that targets light.spot'], ['architecture'],
 '''
 # Fragment contracts

 | line | code | why |
 | --- | --- | --- |
 | `material.metal('Fe').with(rust)` | **E130** | `rust` requires `baseColor`, `roughness`, `metallic`; a bare conductor has none |
 | `light.spot().with(rust)` | **E131** | `rust` targets materials, not lights |
 | `camera.thinLens().with(bokeh).blades(7)` | — | fine: `bokeh` targets cameras |

 The working scene uses `rust` on a `material.pbr()` that has all three attributes.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';
 import { rust, bokeh } from 'candela/fragments';

 // material.metal('Fe').with(rust);            // E130
 // light.spot().with(rust);                    // E131

 const iron = material.pbr().baseColor('#7a7c80').metallic(1).roughness(0.35).with(rust).rust(0.5);

 export default scene()
   .add(shape.cylinder(0.3, 1.0).at(0, 0.5, 0).material(iron))
   .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
   .light(light.daylight({ elevation: u.deg(40) }))
   .camera(camera.thinLens().with(bokeh).blades(7).at(0, 1.1, 2.6).lookAt(0, 0.5, 0).focal(u.mm(50)).fstop(2.8));
 ''', focus='console')
P('D-04','explain','Explain and the IR','Diagnostics','The same scene three ways: the code, the IR text (one line per node, shared nodes marked), and the DAG — with resolved units and defaults.',
 ['Which nodes are shared, and why does that matter for compile time?','Explain the camera exposure in one sentence'], ['architecture','grammar'],
 '''
 # Explain and the IR

 A scene value is a **DAG**: nodes are components, edges are "uses". Because builders are immutable, the same node can be used many times; the IR prints it once and marks the reuse.

 - **IR** — the DAG as indented text, values with units, defaults marked;
 - **Graph** — the same DAG laid out in layers; shared nodes in red;
 - **Console → Explain** — what the compiler decided: defaults filled in, exposures computed, kernels deduplicated.

 The agent reads the same three when you ask it *why*.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const steel = material.metal('Fe', { roughness: 0.3 });
 const peg = shape.cylinder(0.05, 0.6).material(steel);

 export default scene()
   .add([-0.6, -0.2, 0.2, 0.6].map(x => peg.at(x, 0.3, 0)))
   .add(shape.torus(0.2, 0.05).at(-0.6, 0.05, 0).rotateX(u.deg(90)).material(material.plastic('#c8452e')))
   .add(shape.torus(0.16, 0.05).at(-0.6, 0.15, 0).rotateX(u.deg(90)).material(material.plastic('#e0a03c')))
   .add(shape.plane(30).material(material.pbr().baseColor(0.5)))
   .light(light.daylight({ elevation: u.deg(45) }))
   .camera(camera.thinLens().at(0, 1, 2.6).lookAt(0, 0.3, 0).focal(u.mm(45)));
 ''', focus='ir')
