from mk import P
P('M-01','chart','The material chart','Materials','Metallic × roughness: the two axes of the metallic/roughness model, side by side under one sky.',
 ['Explain why the rough metal row looks brighter than the rough dielectric row','Add a third row with a clear coat','Which of these could not exist in reality?'], ['renderer'],
 '''
 # The material chart

 The top row is a **dielectric** (plastic, paint, stone): a diffuse base under a thin specular reflection of about 4 %. The bottom row is a **metal**: no diffuse at all, a coloured reflection. Roughness runs from 0 (a mirror) to 1 (matte) left to right.

 Roughness is *perceptual*: the GGX width is $\\alpha = r^2$, so the steps look even. The metal row stays bright at high roughness because of **multiple scattering**: light that bounces between microfacets is not lost (Kulla–Conty compensation).

 > **Try it.** Ask the agent to add a row with `.coat(1)` and explain what the coat does to the rough samples.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const base = '#c8452e';
 const R = [0, 0.15, 0.3, 0.5, 0.7, 1];
 const row = (metallic, y) => scene.group(R.map((r, i) =>
   shape.sphere(0.32).at((i - 2.5) * 0.8, y, 0).material(material.pbr().baseColor(metallic ? '#e0b070' : base).metallic(metallic).roughness(r))));

 export default scene()
   .add(row(0, 1.15), row(1, 0.35))
   .add(shape.plane(40).material(material.pbr().baseColor(0.25).roughness(0.6)))
   .add(shape.rect(12, 4).at(0, 2, -0.8).rotateX(u.deg(90)).material(material.pbr().baseColor(0.3).roughness(0.8)))
   .light(light.env.studio({ intensity: u.nit(900) }))
   .camera(camera.thinLens().at(0, 0.9, 6).lookAt(0, 0.75, 0).focal(u.mm(45)));
 ''')
P('M-02','metals','Measured metals','Materials','Ten conductors with their measured complex IOR: the colour of gold and copper is Fresnel, not paint.',
 ['Compare exact Fresnel with Schlick for gold at grazing angles','Why is aluminium bluer than silver?','Make them all rough (0.5) — do they stay distinguishable?'], ['renderer'],
 '''
 # Measured metals

 A metal's colour comes from its **complex refractive index** $\\eta + ik$, measured per wavelength. Candela keeps three samples (650, 550, 450 nm) and evaluates the exact conductor Fresnel equations, so gold is yellow at normal incidence and whitens toward grazing angles — as real gold does.

 | metal | F0 (approx. sRGB) |
 | --- | --- |
 | Au | 1.00, 0.78, 0.34 |
 | Ag | 0.97, 0.96, 0.91 |
 | Cu | 0.96, 0.64, 0.54 |
 | Al | 0.91, 0.92, 0.92 |
 | Fe | 0.56, 0.57, 0.58 |
 | Cr | 0.55, 0.56, 0.55 |

 > **Try it.** Change `roughness` to 0.5 — the hues remain; brightness barely drops thanks to multiple scattering.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const metals = ['Au', 'Ag', 'Cu', 'Al', 'Fe', 'Cr', 'Ti', 'Ni', 'Pt', 'brass'];
 const roughness = 0.12;

 export default scene()
   .add(metals.map((m, i) => shape.sphere(0.3).id('m-' + m).at((i % 5 - 2) * 0.78, 0.3, Math.floor(i / 5) * -0.9).material(material.metal(m, { roughness }))))
   .add(shape.plane(40).material(material.pbr().baseColor(0.12).roughness(0.5)))
   .light(light.env.studio({ intensity: u.nit(1000), rotate: u.deg(-15) }))
   .camera(camera.thinLens().at(0, 1.6, 4.2).lookAt(0, 0.25, -0.45).focal(u.mm(45)));
 ''')
P('M-03','fresnel','Fresnel at grazing angles','Materials','A black lacquered floor: 4 % reflection looking down, nearly a mirror at the horizon.',
 ['Change the IOR to 1.33 and to 2.4: how does F0 change?','Make the floor rough — where does the reflection go?'], ['renderer'],
 '''
 # Fresnel at grazing angles

 Every dielectric reflects more as light grazes it. At normal incidence the reflectance is

 $$F_0 = \\left(\\frac{n - 1}{n + 1}\\right)^2 = 0.04 \\quad (n = 1.5)$$

 and it rises toward 1 at 90°. The floor here is a smooth dielectric over a black base: near the camera you see 4 % of the columns; far away, the reflection is almost as bright as the columns themselves.

 Candela evaluates the **exact** unpolarised Fresnel equations for dielectrics, not Schlick's approximation.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, param, params, units as u } from 'candela';

 const P = params({ n: param.float(1.5).range(1.0, 2.5).label('Floor IOR'), rough: param.float(0.02).range(0, 0.5).label('Floor roughness') });
 const lacquer = material(bsdf.layer(bsdf.dielectric({ ior: P.n, roughness: P.rough }), bsdf.lambert(0.03)));
 const col = material.pbr().baseColor('#e8e0d0').roughness(0.6);

 export default scene().params(P)
   .add(scene.group(g => { for (let i = 0; i < 8; i++) { g.add(shape.cylinder(0.2, 2.5).at(-1.6, 1.25, -i * 2).material(col)); g.add(shape.cylinder(0.2, 2.5).at(1.6, 1.25, -i * 2).material(col)); } }))
   .add(shape.plane().material(lacquer))
   .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(200) }))
   .camera(camera.thinLens().at(0, 0.9, 4).lookAt(0, 0.7, -6).focal(u.mm(28)));
 ''', focus='params')
P('M-04','glass-ior','Glass, water, diamond','Materials','Four spheres of refractive index 1.33, 1.5, 1.77 and 2.42 over a checkerboard: refraction bends harder as n grows.',
 ['Render this spectrally — does the diamond disperse?','Make the third sphere hollow (a thin shell)'], ['algebra', 'renderer'],
 '''
 # Glass, water, diamond

 Smooth dielectric spheres: water (1.333), crown glass (1.5), sapphire (1.77), diamond (2.42). The image through each is inverted and shrunk by an amount that depends on $n$: a sphere is a thick lens of focal length $f = nR / 2(n - 1)$.

 The higher the index, the stronger the reflection at the rim ($F_0$ = 2 %, 4 %, 8 %, 17 %) and the more total internal reflection inside — which is what makes diamond sparkle.

 Here each IOR is a single number, so there is no dispersion. See **Spectral** for wavelength-dependent glass.
 ''',
 '''
 import { scene, shape, material, ior, light, camera, fx, units as u } from 'candela';

 const n = [1.333, 1.5, 1.77, 2.42];
 const board = material.pbr().roughness(0.6).baseColor(p => fx.mix(fx.color(0.08), fx.color(0.8), fx.checker(p.P.xz, 3)));

 export default scene()
   .add(n.map((k, i) => shape.sphere(0.4).at((i - 1.5) * 1.0, 0.42, 0).material(material.glass({ ior: k }))))
   .add(shape.plane(40).material(board))
   .light(light.env.studio({ intensity: u.nit(800) }))
   .camera(camera.thinLens().at(0, 1.8, 3.6).lookAt(0, 0.3, 0).focal(u.mm(40)));
 ''')
P('M-05','frosted','Frosted glass','Materials','Rough dielectric transmission: the same glass at roughness 0, 0.1, 0.25 and 0.5 in front of a striped panel.',
 ['Explain why frosted glass blurs distant things more than near ones','Tint the frosted panes'], ['renderer'],
 '''
 # Frosted glass

 A rough dielectric scatters transmitted light into a lobe around the refracted direction — the microfacet model applied to refraction (Walter et al. 2007). Things right behind the pane stay sharp; things far behind blur, because the lobe's angular width is fixed and the footprint grows with distance.

 Each pane is a thin box of glass; the stripes are 0.6 m behind it.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const rough = [0, 0.1, 0.25, 0.5];
 const stripes = material.pbr().roughness(0.5).baseColor(p => fx.mix(fx.color('#1a1a1a'), fx.color('#e6dcc8'), fx.stripes(p.P.x, 6)));

 export default scene()
   .add(rough.map((r, i) => shape.roundedBox(0.8, 1.2, 0.05, 0.01).at((i - 1.5) * 0.95, 0.65, 0).material(material.glass({ ior: 1.5, roughness: r }))))
   .add(shape.rect(5, 2.5).at(0, 1.25, -0.6).rotateX(u.deg(90)).material(stripes))
   .add(shape.sphere(0.12).at(0.45, 0.4, -0.15).material(material.plastic('#2a6fd0', 0.3)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.4)))
   .light(light.env.studio({ intensity: u.nit(900) }))
   .camera(camera.thinLens().at(0, 0.8, 3.4).lookAt(0, 0.65, 0).focal(u.mm(45)));
 ''')
P('M-06','beer-lambert','Coloured glass: Beer–Lambert','Materials','The same absorbing glass in slabs 1, 2, 4 and 8 cm thick: colour deepens with distance travelled.',
 ['Why does the thick slab look a different hue, not just darker?','Fill a glass with red wine'], ['media'],
 '''
 # Coloured glass: Beer–Lambert

 Coloured glass is clear glass with an **absorbing interior medium**. Light that travels a distance $d$ inside keeps a fraction

 $$T(d) = e^{-\\sigma_a d}$$

 per wavelength. `material.glass({ absorb: '#6cc890', distance: u.cm(2) })` means: *this* is the colour after 2 cm. Thicker slabs go deeper, and since red is absorbed faster than green here, the hue shifts too — not just the brightness.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const green = material.glass({ ior: 1.52, absorb: '#6cc890', distance: u.cm(2) });
 const t = [1, 2, 4, 8];

 export default scene()
   .add(t.map((cm, i) => shape.box(0.5, 0.7, cm / 100).at((i - 1.5) * 0.7, 0.35, 0).material(green)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.85).unchecked('W330')))
   .light(light.sun().elevation(u.deg(40)).azimuth(u.deg(160)).illuminance(u.lux(80000)))
   .light(light.sky.physical({ turbidity: 3 }).fromSun())
   .camera(camera.thinLens().at(0.4, 1.3, 2.6).lookAt(0, 0.3, 0).focal(u.mm(40)));
 ''')
P('M-07','car-paint','Car paint','Materials','Pigment, metallic flakes and a clear coat: a three-layer BSDF built from the algebra, with sliders for each layer.',
 ['Swap to a pearl white paint','What does the clear coat add at grazing angles?'], ['renderer'],
 '''
 # Car paint

 Car paint is a **layered** material:

 ```js
 bsdf.layer(
   bsdf.dielectric({ ior: 1.5, roughness: coatRoughness }),              // clear coat
   bsdf.mix(bsdf.lambert(pigment), bsdf.conductor({ ior: 'Al', roughness: 0.3 }), flakes))
 ```

 The coat is a smooth dielectric that reflects the environment sharply (the "wet look"); the light it transmits reaches a base where diffuse pigment and aluminium flakes are mixed. `layer` couples the two by Fresnel, so the coat's reflection grows at grazing angles and the base gets correspondingly less light — energy is conserved by construction.
 ''',
 '''
 import { scene, shape, material, bsdf, ior, light, camera, param, params, units as u } from 'candela';

 const P = params({
   pigment: param.color('#9c1420').label('Pigment'),
   flakes: param.float(0.1).range(0, 1).label('Flakes'),
   coat: param.float(0.02).range(0, 0.4).label('Coat roughness'),
 });
 const paint = material(bsdf.layer(
   bsdf.dielectric({ ior: 1.5, roughness: P.coat }),
   bsdf.mix(bsdf.lambert(P.pigment), bsdf.conductor({ ior: ior.metal('Al'), roughness: 0.3 }), P.flakes)));
 const tyre = material.rubber(0.03);
 const chrome = material.metal('Cr', { roughness: 0.05 });

 const wheel = (x, z) => scene.group([
   shape.cylinder(0.33, 0.24).at(x, 0.33, z).rotateX(u.deg(90)).material(tyre),
   shape.cylinder(0.2, 0.25).at(x, 0.33, z).rotateX(u.deg(90)).material(chrome),
 ]);

 export default scene().params(P)
   .add(shape.roundedBox(3.6, 0.7, 1.7, 0.3).at(0, 0.7, 0).material(paint).id('body'))
   .add(shape.roundedBox(2.0, 0.6, 1.5, 0.28).at(-0.2, 1.25, 0).material(paint))
   .add(shape.roundedBox(1.9, 0.42, 1.52, 0.2).at(-0.2, 1.28, 0).material(material.glass({ ior: 1.5, absorb: '#304040', distance: u.cm(1) })))
   .add([wheel(-1.15, 0.8), wheel(1.15, 0.8), wheel(-1.15, -0.8), wheel(1.15, -0.8)])
   .add(shape.plane().material(material.pbr().baseColor(0.2).roughness(0.35)))
   .light(light.env.studio({ intensity: u.nit(1100), rotate: u.deg(30) }))
   .camera(camera.thinLens().at(4.6, 1.8, 4.2).lookAt(0, 0.75, 0).focal(u.mm(45)).fstop(8));
 ''', focus='params')
P('M-08','velvet','Velvet and sheen','Materials','A sheen lobe over a diffuse base: fibres catch light at grazing angles, so velvet glows at its silhouette.',
 ['Compare the velvet with a plain Lambert of the same colour','Make the sheen roughness smaller'], ['renderer'],
 '''
 # Velvet and sheen

 Cloth has fibres standing up from the surface. Seen straight on, you look between them into the dark weave; at grazing angles you see their sides, lit. The **Charlie sheen** distribution (Estevez & Kulla 2017) models this:

 $$D(\\mathbf h) = \\frac{(2 + 1/r)\\,\\sin^{1/r}\\theta_h}{2\\pi}$$

 Left: velvet = `layer(sheen, lambert)`. Right: the same colour as a plain Lambertian surface. The difference is all at the silhouettes.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, units as u } from 'candela';

 const colour = '#5b1a3a';
 const velvet = material(bsdf.layer(bsdf.sheen({ color: '#f0c0d8', roughness: 0.35 }), bsdf.lambert(colour)));
 const matte = material.diffuse(colour);

 const cushion = (m, x) => scene.group([
   shape.roundedBox(1.0, 0.35, 1.0, 0.16).at(x, 0.18, 0).material(m),
   shape.sphere(0.32).at(x, 0.62, 0).scale(1, 0.85, 1).material(m),
 ]);

 export default scene()
   .add(cushion(velvet, -0.7), cushion(matte, 0.7))
   .add(shape.plane(30).material(material.pbr().baseColor(0.5).roughness(0.6)))
   .light(light.env.studio({ intensity: u.nit(700), rotate: u.deg(60) }))
   .light(light.sun().elevation(u.deg(20)).azimuth(u.deg(220)).illuminance(u.lux(20000)))
   .camera(camera.thinLens().at(0, 1.4, 3.2).lookAt(0, 0.35, 0).focal(u.mm(45)));
 ''')
P('M-09','brushed','Brushed metal: anisotropy','Materials','Two roughnesses, one per tangent direction: highlights stretch across the brushing.',
 ['Swap the roughness pair and see the highlight rotate','Make an anisotropic copper kettle'], ['renderer'],
 '''
 # Brushed metal: anisotropy

 Brushing leaves parallel grooves. Along the grooves the surface is smooth; across them it is rough. GGX handles this with two widths, $\\alpha_x$ and $\\alpha_y$, along the surface tangents:

 ```js
 bsdf.conductor({ ior: 'Al', roughness: [0.08, 0.45] })
 ```

 The highlight stretches **perpendicular** to the grooves. Sampling still uses the visible-normal distribution (VNDF), so the noise stays low.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, param, params, units as u } from 'candela';

 const P = params({ along: param.float(0.08).range(0.01, 1).label('Roughness along'), across: param.float(0.45).range(0.01, 1).label('Roughness across') });
 const brushed = material(bsdf.conductor({ ior: 'Al', roughness: [P.along, P.across] }));
 const iso = material.metal('Al', { roughness: 0.25 });

 export default scene().params(P)
   .add(shape.cylinder(0.45, 1.0).at(-0.6, 0.5, 0).material(brushed))
   .add(shape.cylinder(0.45, 1.0).at(0.6, 0.5, 0).material(iso))
   .add(shape.disk(1.3).at(0, 0.002, 1.3).material(brushed))
   .add(shape.plane(30).material(material.pbr().baseColor(0.1).roughness(0.6)))
   .light(light.point().at(0.2, 2.2, 2.4).power(u.lm(6000)).radius(0.04))
   .light(light.env.gradient({ top: '#9fb4c8', bottom: '#202020', intensity: u.nit(60) }))
   .camera(camera.thinLens().at(0, 1.5, 3.8).lookAt(0, 0.4, 0.2).focal(u.mm(40)));
 ''', focus='params')
P('M-10','thin-film','Thin-film interference','Materials','Oil films, heat-tinted titanium, soap: a film a few hundred nanometres thick turns reflection into rainbows.',
 ['Animate the film thickness with time','Which thickness gives the deep blue of heat-treated titanium?','Render spectrally and compare'], ['algebra', 'renderer'],
 '''
 # Thin-film interference

 A film of thickness $d$ and index $n$ reflects light twice — from its top and its bottom. The two waves interfere with a phase difference

 $$\\delta = \\frac{4\\pi}{\\lambda}\\, n\\, d \\cos\\theta_t$$

 so some wavelengths reinforce and others cancel. Candela evaluates the **Airy summation** of all internal reflections (Belcour & Barla 2017 in the spectral engine; three wavelengths in RGB).

 The row runs 100 → 800 nm on titanium; the front sphere is a soap bubble, a free film 400 nm thick.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({ film: param.float(320).range(0, 1200).label('Film (nm) on the big sphere') });
 const thick = [100, 200, 300, 400, 550, 800];

 export default scene().params(P)
   .add(thick.map((d, i) => shape.sphere(0.22).at((i - 2.5) * 0.52, 0.22, -0.6)
     .material(material.pbr().baseColor('#c0bab0').metallic(1).roughness(0.2).thinFilm(d))))
   .add(shape.sphere(0.45).at(-0.55, 0.45, 0.4).material(material.pbr().baseColor('#c0bab0').metallic(1).roughness(0.15).thinFilm(P.film)))
   .add(shape.sphere(0.4).at(0.6, 0.6, 0.5).material(material.soapFilm({ thickness: u.nm(400) })))
   .add(shape.plane(30).material(material.pbr().baseColor(0.06).roughness(0.4)))
   .light(light.env.studio({ intensity: u.nit(1000) }))
   .camera(camera.thinLens().at(0, 1.1, 3.2).lookAt(0, 0.35, 0).focal(u.mm(40)));
 ''', focus='params')
P('M-11','subsurface','Wax, jade, skin','Materials','Light that enters, wanders and leaves: subsurface scattering as a volume inside a dielectric.',
 ['Halve the mean free path of the wax','Put a light behind the jade'], ['media'],
 '''
 # Wax, jade, skin

 Subsurface scattering is not a special trick here: `material.subsurface()` is a **dielectric boundary with a scattering medium inside**, traced as a random walk. The mean free path sets how far light goes before scattering; the albedo sets what fraction survives each event.

 | material | albedo | mean free path |
 | --- | --- | --- |
 | wax | 0.95 0.85 0.7 | 6 mm |
 | jade | 0.6 0.9 0.7 | 12 mm |
 | skin | 0.95 0.75 0.62 | 4 mm |
 | marble | 0.97 0.96 0.94 | 10 mm |

 A back light shows the difference most: the thin edges glow.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const wax = material.subsurface({ albedo: [0.95, 0.85, 0.7], meanFreePath: u.mm(6), roughness: 0.4 });
 const jade = material.subsurface({ albedo: [0.6, 0.9, 0.7], meanFreePath: u.mm(12), roughness: 0.15 });
 const skin = material.subsurface({ albedo: [0.95, 0.75, 0.62], meanFreePath: u.mm(4), roughness: 0.45 });
 const marble = material.subsurface({ albedo: [0.97, 0.96, 0.94], meanFreePath: u.mm(10), roughness: 0.2 });

 export default scene()
   .add(shape.cylinder(0.12, 0.42).at(-0.75, 0.21, 0).material(wax))
   .add(shape.torus(0.13, 0.05).at(-0.25, 0.05, 0.1).material(jade))
   .add(shape.sphere(0.15).at(0.25, 0.15, 0).material(skin))
   .add(shape.roundedBox(0.3, 0.3, 0.3, 0.03).at(0.75, 0.15, 0).rotateY(u.deg(30)).material(marble))
   .add(shape.plane(20).material(material.pbr().baseColor(0.15).roughness(0.7)))
   .add(shape.rect(0.8, 0.8).at(0, 0.7, -1.0).facing(0, 0.15, 0).emit(light.area().power(u.lm(3000)).temperature(u.K(4000))))
   .light(light.env.uniform(u.nit(20)))
   .camera(camera.thinLens().at(0, 0.75, 2.4).lookAt(0, 0.15, 0).focal(u.mm(35)).fstop(5.6));
 ''')
P('M-12','multiscatter','The white furnace','Materials','A rough mirror in a uniform environment should vanish. Without multiple-scattering compensation it goes dark at high roughness.',
 ['Open the Lab and read the furnace numbers','Turn compensation off on the left spheres'], ['invariants','renderer'],
 '''
 # The white furnace

 Put a lossless material in a uniform, white environment and it must **disappear**: everything it reflects is the same white. This is the furnace test, and it catches energy loss.

 The single-scattering GGX model loses the light that bounces more than once between microfacets — up to 40 % at roughness 1. The spheres on the **left** use `.multiscatter(false)`; those on the **right** use Kulla–Conty compensation (the default), which adds the missing energy back using a precomputed table $E(\\mu, \\alpha)$.

 The scene file also runs `test.furnace` on the CPU and logs the albedo per angle — look in the **Console**.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, units as u } from 'candela';
 import { test } from 'candela/test';

 const R = [0.2, 0.5, 0.8, 1.0];
 const single = r => bsdf.conductor.schlick({ f0: 1, roughness: r }).multiscatter(false);
 const multi = r => bsdf.conductor.schlick({ f0: 1, roughness: r });

 console.log('furnace, roughness 1, single:', JSON.stringify(test.furnace(single(1)).albedo));
 console.log('furnace, roughness 1, multi: ', JSON.stringify(test.furnace(multi(1)).albedo));

 export default scene()
   .add(R.map((r, i) => shape.sphere(0.28).at(-0.35, 0.3 + i * 0.62, 0).material(material(single(r)))))
   .add(R.map((r, i) => shape.sphere(0.28).at(0.35, 0.3 + i * 0.62, 0).material(material(multi(r)))))
   .light(light.env.uniform(u.nit(100)))
   .camera(camera.pinhole().at(0, 1.25, 5).lookAt(0, 1.25, 0).focal(u.mm(50)).exposure(8.6));
 ''', focus='console')
P('M-13','mirrors','Infinity mirror','Materials','Two facing mirrors and a light between them: each reflection is one more bounce, until the path depth runs out.',
 ['Lower the max depth to 4 and count the reflections','Tint one mirror slightly — what happens deep in the tunnel?'], ['renderer'],
 '''
 # Infinity mirror

 A real mirror reflects about 90–97 %. Two facing mirrors give a tunnel of images, each dimmer by the product of the reflectances, and each one **path bounce** deeper. The engine here traces up to 24 bounces, so the tunnel ends where the depth limit does — Russian roulette is pushed back for the same reason.

 Mirror reflections are a delta BSDF: they cannot be sampled by next-event estimation, so the light seen in the mirrors comes entirely from BSDF sampling with MIS weight 1.
 ''',
 '''
 import { scene, shape, material, light, camera, engine, integrator, units as u } from 'candela';

 const mirror = material.metal('Ag', { roughness: 0.0 });

 export default scene()
   .add(shape.rect(3, 2).at(0, 1, -1.2).rotateX(u.deg(90)).material(mirror))
   .add(shape.rect(3, 2).at(0, 1, 1.2).rotateX(u.deg(-90)).material(mirror))
   .add(shape.sphere(0.2).at(0, 0.7, 0).material(material.plastic('#e0a020', 0.25)))
   .add(shape.torus(0.16, 0.025).at(-0.15, 1.3, -0.4).rotateX(u.deg(90)).material(material.emissive('#40d0ff', u.nit(300))))
   .add(shape.plane(20).material(material.pbr().baseColor('#6a5a48').roughness(0.7)))
   .add(shape.rect(0.6, 0.6).at(0, 2.2, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(1200)).temperature(u.K(3500))))
   .light(light.env.gradient({ top: '#30343a', bottom: '#101010', intensity: u.nit(8) }))
   .camera(camera.thinLens().at(0.45, 1.05, 1.05).lookAt(-0.15, 1.0, -1.2).focal(u.mm(28)).exposure(5.5));

 export const engine = engine.offline().integrator(integrator.path({ maxDepth: 24, rr: { after: 16 } }));
 ''')
P('M-14','clear-coat','Clear coat','Materials','A coat on top of anything: wood, rubber, a matte paint. The coat’s roughness changes the material more than the base does.',
 ['Sweep the coat roughness','Put a coat on the gold sphere — is that physical?'], ['renderer'],
 '''
 # Clear coat

 `material.pbr().coat(1)` adds a thin dielectric layer above the base. In the algebra it is `layer(dielectric, base)`: the coat reflects a Fresnel-weighted part of the light, the rest reaches the base, and the light coming back out is attenuated by the coat again.

 From left to right: a rough base (0.8) with **no coat**, with a **glossy coat**, with a **satin coat** (0.25), and with a **tinted coat** (amber, like varnish).
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const wood = p => fx.ramp(fx.noise.fbm(p.P.mul(fx.vec3(3, 3, 30)), { octaves: 4 }).mul(0.5).add(0.5), [[0, '#4a2a14'], [0.5, '#8a5a30'], [1, '#c08a50']]);
 const base = material.pbr().baseColor(wood).roughness(0.8);
 const v = [base, base.coat(1).coatRoughness(0.02), base.coat(1).coatRoughness(0.25), base.coat(1).coatRoughness(0.03).coatColor('#e0a040')];

 export default scene()
   .add(v.map((m, i) => shape.roundedBox(0.6, 0.6, 0.6, 0.08).at((i - 1.5) * 0.85, 0.3, 0).rotateY(u.deg(20)).material(m)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.35).roughness(0.7)))
   .light(light.env.studio({ intensity: u.nit(900) }))
   .camera(camera.thinLens().at(0, 1.4, 3.6).lookAt(0, 0.3, 0).focal(u.mm(42)));
 ''')
P('A-01','mix','mix: blending two BSDFs','Algebra','bsdf.mix(a, b, t) is a convex combination: valid for any t in [0, 1], and t can be a field or a slider.',
 ['Drive the mix with a voronoi field instead of stripes','Explain how mix is sampled (stochastic selection)'], ['algebra','renderer'],
 '''
 # mix: blending two BSDFs

 $$f = (1 - t)\\, f_a + t\\, f_b$$

 Mixing is a **convex** combination, so if `a` and `b` conserve energy, so does the mix — for every `t` in [0, 1]. The kernel never evaluates both: it picks `a` with probability $1-t$ and `b` with probability $t$ (stochastic selection), which costs one lobe per bounce no matter how deep the tree is.

 Left: `t` is a slider. Right: `t` is a field — stripes of gold on a blue ceramic.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({ t: param.float(0.5).range(0, 1).label('Mix t') });
 const blue = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.05 }), bsdf.lambert('#1d4f9a'));
 const gold = bsdf.conductor({ ior: 'Au', roughness: 0.2 });

 export default scene().params(P)
   .add(shape.sphere(0.5).at(-0.65, 0.5, 0).material(material(bsdf.mix(blue, gold, P.t))))
   .add(shape.sphere(0.5).at(0.65, 0.5, 0).material(material(bsdf.mix(blue, gold, p => fx.stripes(p.P.y, 7, 0.7)))))
   .add(shape.plane(30).material(material.pbr().baseColor(0.4)))
   .light(light.env.studio({ intensity: u.nit(900) }))
   .camera(camera.thinLens().at(0, 1.0, 3.2).lookAt(0, 0.5, 0).focal(u.mm(45)));
 ''', focus='params')
P('A-02','layer','layer: varnish over wood','Algebra','bsdf.layer(top, bottom) couples a dielectric coat to anything below it by Fresnel — energy-conserving by construction.',
 ['Thicken the varnish tint','What happens if the top layer is a conductor?'], ['grammar'],
 '''
 # layer: varnish over wood

 ```js
 bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.05 }), wood, { tint: '#e0a040', thickness: 0.3 })
 ```

 The top layer reflects $F(\\theta)$; the bottom receives $1 - F(\\theta)$, attenuated by the layer's **tint** on the way in and out (longer paths at grazing angles absorb more). The top of a layer must be a dielectric or a sheen; a conductor on top would let nothing through, which is **E133**.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({ thick: param.float(0.3).range(0, 1).label('Varnish thickness') });
 const grain = p => fx.ramp(fx.noise.fbm(p.P.mul(fx.vec3(4, 40, 4)), { octaves: 4 }).mul(0.5).add(0.5), [[0, '#3c2210'], [0.6, '#7a4a24'], [1, '#a8703c']]);
 const wood = bsdf.lambert(grain);
 const varnished = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.05 }), wood, { tint: '#e0a040', thickness: P.thick });

 export default scene().params(P)
   .add(shape.box(1.0, 0.08, 2.2).at(-0.6, 0.04, 0).material(material(wood)))
   .add(shape.box(1.0, 0.08, 2.2).at(0.6, 0.04, 0).material(material(varnished)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.25)))
   .light(light.point().at(0.4, 1.4, -1.6).power(u.lm(5000)).radius(0.06))
   .light(light.env.uniform(u.nit(30)))
   .camera(camera.thinLens().at(0, 1.2, 2.6).lookAt(0, 0, -0.3).focal(u.mm(35)));
 ''', focus='params')
P('A-03','add','add: checked sums','Algebra','bsdf.add can create energy, so it is checked. Scale the parts, or use layer, and the warning goes away.',
 ['Fix W420 two different ways','Run the furnace on the added BSDF'], ['algebra','invariants'],
 '''
 # add: checked sums

 `add(a, b)` is the sum $f_a + f_b$. It is the right tool when two lobes describe physically separate paths (a glow plus a reflection, say), but nothing stops the sum reflecting more than it receives. The compiler estimates the directional albedo of each side and warns:

 > **W420** — bsdf.add reflects up to 1.42× the incident light

 Two fixes: scale the parts (`a.scale(0.5)`, `b.scale(0.5)`), or replace `add` with `layer` — then the bottom only receives what the top transmits.

 The middle sphere glows because the scene renders the warning case, so you can see what "creating energy" looks like in a furnace-like environment.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, units as u } from 'candela';

 const diffuse = bsdf.lambert(0.7);

 export default scene()
   .add(shape.sphere(0.45).at(-1.05, 0.45, 0).material(material(bsdf.add(diffuse.scale(0.5), bsdf.conductor.schlick({ f0: 0.5, roughness: 0.2 }).scale(0.5)))))
   .add(shape.sphere(0.45).at(0, 0.45, 0).material(material(bsdf.add(diffuse, bsdf.conductor.schlick({ f0: 0.7, roughness: 0.2 })))))   // W420
   .add(shape.sphere(0.45).at(1.05, 0.45, 0).material(material(bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.2 }), diffuse))))
   .add(shape.plane(30).material(material.pbr().baseColor(0.5)))
   .light(light.env.uniform(u.nit(100)))
   .camera(camera.thinLens().at(0, 0.9, 3.6).lookAt(0, 0.45, 0).focal(u.mm(45)));
 ''', focus='console')
P('A-04','define','material.define: a tile material','Algebra','A new material kind in ten lines: its attributes become methods, sliders and targets for fragments.',
 ['Add a grout depth attribute that bumps the grout','Make hexagonal tiles'], ['grammar','architecture'],
 '''
 # material.define: a tile material

 `material.define(name, attributes, body)` makes a new kind of material:

 - its **attributes** are params, so each becomes a builder method (`.tiles(8)`), a slider and an attribute fragments can `map`;
 - its **body** is a function from attributes to a BSDF, traced once per distinct use.

 `material.pbr` itself is defined this way (see `src/stdlib.js`). Here, `tiles()` mixes a glazed ceramic with a rough grout by a mask computed from the UV grid.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, fx, param, params, units as u } from 'candela';

 const tile = material.define('tile', {
   glaze: param.color('#2a6f8f'),
   grout: param.color('#d8d2c4'),
   tiles: param.float(6).range(1, 20),
   gap: param.float(0.06).range(0.01, 0.3),
 }, m => {
   const g = fx.pattern(p => p.P.xz.mul(m.tiles).fract());
   const edge = fx.min(fx.min(g.x, g.y), fx.min(g.x.oneMinus(), g.y.oneMinus()));
   const mask = edge.smoothstep(m.gap.mul(0.5), m.gap.mul(0.5).add(0.01));
   const glazed = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.04 }), bsdf.lambert(m.glaze));
   return bsdf.mix(bsdf.lambert(m.grout), glazed, mask);
 });

 const P = params({ n: param.float(6).range(1, 16).label('Tiles per metre'), gap: param.float(0.06).range(0.01, 0.3).label('Grout') });

 export default scene().params(P)
   .add(shape.plane(30).material(tile().tiles(P.n).gap(P.gap)))
   .add(shape.sphere(0.4).at(0, 0.4, 0).material(material.metal('Cu', { roughness: 0.15 })))
   .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(30) }))
   .camera(camera.thinLens().at(0, 1.3, 2.6).lookAt(0, 0.25, 0).focal(u.mm(35)));
 ''', focus='params')
P('A-05','fragments','Fragments: rust and wear','Algebra','Ready-made fragments add methods to material.pbr: .rust(), .wear(), .dust(), .aged(years) — each lowered into the material’s attributes.',
 ['Age the bench by 20 years','Write a fragment of your own that adds .moss()','Try .with(rust) on material.metal() — what error and why?'], ['architecture','grammar'],
 '''
 # Fragments: rust and wear

 A **fragment** extends a component kind with new attributes and methods, then *lowers* them into attributes the kind already has. `rust` adds `.rust(amount)` and `.rustScale()`, and at compile time maps `baseColor`, `roughness` and `metallic` through a noise threshold.

 ```js
 material.pbr().metallic(1).with(rust).rust(0.6)
 ```

 Fragments declare what they need (`.requires('baseColor', 'roughness', 'metallic')`). `material.metal('Fe')` is built from a bare conductor BSDF and has none of these, so `.with(rust)` on it is **E130** — the contract is checked, not assumed.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';
 import { rust, weathering } from 'candela/fragments';

 const P = params({ rust: param.float(0.45).range(0, 1).label('Rust'), age: param.float(6).range(0, 30).label('Age (years)') });

 const steel = material.pbr().baseColor('#8a8c8e').metallic(1).roughness(0.3);
 const paint = material.pbr().baseColor('#2f6e4a').roughness(0.4);

 export default scene().params(P)
   .add(shape.cylinder(0.35, 1.2).at(-0.8, 0.6, 0).material(steel.with(rust).rust(P.rust).rustScale(5)))
   .add(shape.roundedBox(1.0, 0.9, 0.9, 0.06).at(0.6, 0.45, 0).material(paint.metallic(0).with(weathering).aged(P.age)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.35).roughness(0.9)))
   .light(light.daylight({ elevation: u.deg(40), azimuth: u.deg(60) }))
   .camera(camera.thinLens().at(0, 1.4, 3.2).lookAt(0, 0.5, 0).focal(u.mm(40)));
 ''', focus='params')
P('A-06','own-fragment','Writing a fragment','Algebra','A fragment of your own: .moss() grows green on upward-facing surfaces, with an around-advice that keeps baseColor plausible.',
 ['Make the moss also prefer the shadowed side','Apply the fragment globally with candela.use'], ['architecture'],
 '''
 # Writing a fragment

 ```js
 const moss = fragment('moss')
   .targets('material.pbr')
   .requires('baseColor', 'roughness')
   .params({ moss: param.float(0).range(0, 1) })
   .lower((m, f) => m.map('baseColor', c => fx.mix(c, mossColour, coverage(f.moss))) … )
 ```

 - `.targets()` — which kinds it extends;
 - `.params()` — new attributes, each a method and a slider;
 - `.lower()` — at compile time, rewrite the material's own attributes;
 - `.around('roughness', (next, self, r) => …)` — wrap an existing method (here: a mossy stone is never glossier than 0.3, whatever you pass).

 Open the **Graph** to see the lowered expression: the moss mask sits under `baseColor` and `roughness`.
 ''',
 '''
 import { scene, shape, material, fragment, light, camera, fx, param, params, units as u } from 'candela';

 const moss = fragment('moss')
   .targets('material.pbr')
   .requires('baseColor', 'roughness')
   .params({ moss: param.float(0).range(0, 1) })
   .around('roughness', (next, self, r) => next(typeof r === 'number' ? Math.max(r, 0.3) : r))   // moss never goes glossy
   .lower((m, f) => {
     const up = fx.pattern(p => p.N.y.smoothstep(0.2, 0.9));
     const n = fx.pattern(p => fx.noise.fbm(p.P.mul(6), { octaves: 5 }).add(0.5));
     const k = fx.smoothstep(f.moss.oneMinus(), f.moss.oneMinus().add(0.08), up.mul(n));
     return m.map('baseColor', c => fx.mix(c, fx.color('#3d5a1e'), k)).map('roughness', r => fx.mix(r, 0.95, k));
   });

 const P = params({ moss: param.float(0.55).range(0, 1).label('Moss') });
 const stone = material.pbr().baseColor('#8d877c').roughness(0.75).with(moss).moss(P.moss);

 export default scene().params(P)
   .add(shape.roundedBox(1.2, 0.5, 0.8, 0.12).at(-0.5, 0.25, 0).material(stone))
   .add(shape.sphere(0.45).at(0.8, 0.45, 0.1).material(stone))
   .add(shape.roundedBox(0.5, 1.1, 0.5, 0.08).at(-0.2, 0.55, -0.9).material(stone))
   .add(shape.plane(30).material(material.pbr().baseColor('#5a4a38').roughness(0.95)))
   .light(light.daylight({ elevation: u.deg(55), azimuth: u.deg(120) }))
   .camera(camera.thinLens().at(0.4, 1.5, 3.4).lookAt(0, 0.4, -0.2).focal(u.mm(38)));
 ''', focus='params')
