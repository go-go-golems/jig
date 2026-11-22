from mk import P
P('S-01','dispersion','Dispersion: hero wavelengths','Spectral','Dense flint glass in front of a striped light: in the spectral engine every edge splits into a rainbow; in RGB it cannot.',
 ['Switch the spectral toggle off and read W610','Swap SF11 for fused silica — how much weaker is the fringing?','What is the Abbe number of each glass?'], ['renderer','algebra'],
 '''
 # Dispersion: hero wavelengths

 Glass bends blue more than red. A **Sellmeier** equation gives the index per wavelength:

 $$n^2(\\lambda) = 1 + \\sum_{i=1}^{3} \\frac{B_i \\lambda^2}{\\lambda^2 - C_i}$$

 `ior.glass('SF11')` is a dense flint ($n_d = 1.785$, Abbe number 25.7: strongly dispersive). The **spectral** engine traces each path at a *hero wavelength* (plus three companions spread over the visible range), so every refraction bends by the right amount for that colour, and the result is accumulated through the CIE matching functions.

 The RGB engine has one index per path — it uses $n_d$ and reports **W610**: the dispersion you asked for is being ignored.

 > **Try it.** Toggle **Spectral** off: the fringes vanish, and W610 appears in the Console.
 ''',
 '''
 import { scene, shape, material, bsdf, ior, light, camera, engine as E, fx, param, params, units as u } from 'candela';

 const P = params({ spectral: param.bool(true).label('Spectral').static() });
 const flint = material(bsdf.dielectric({ ior: ior.glass('SF11') }));
 const stripes = material.emissive('#000000', u.nit(1)).emission(p => fx.color(1).mul(fx.stripes(p.P.x, 6, 0.7)), u.nit(250));

 export default scene().params(P)
   .add(shape.sphere(0.45).at(-0.55, 0.5, 0.2).material(flint))
   .add(shape.prism({ size: 0.5, depth: 0.9 }).at(0.6, 0.3, 0.1).rotateX(u.deg(90)).rotateY(u.deg(20)).material(flint))
   .add(shape.rect(8, 6).at(0, 1.5, -1.0).rotateX(u.deg(90)).material(stripes))
   .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.6)))
   .light(light.env.uniform(u.nit(40)))
   .camera(camera.thinLens().at(0, 0.6, 2.6).lookAt(0, 0.45, 0).focal(u.mm(45)));

 export const engine = P.spectral.value ? E.offline().spectral() : E.offline();
 ''', focus='params')
P('S-02','diamond','Diamond fire','Spectral','An octahedral diamond with its Sellmeier dispersion: total internal reflection traps light, dispersion splits it into fire.',
 ['Compare with cubic zirconia (n ≈ 2.17, less dispersive)','Add a second, smaller gem'], ['renderer'],
 '''
 # Diamond fire

 Diamond has a very high index ($n_d = 2.417$) — its critical angle is only 24.4°, so most light that enters is trapped and bounces inside until it finds a facet to leave by. It is also fairly dispersive (Abbe 55): each internal bounce spreads the colours a little more. The flashes of colour are called **fire**.

 The gem here is a distance field — an octahedron with a flat table — and its IOR is diamond's Sellmeier fit:

 ```js
 ior.sellmeier({ B: [0.3306, 4.3356, 0], C: [0.1750 ** 2, 0.1060 ** 2, 0] })   // λ in µm
 ```

 Small, bright lights make fire visible; a uniform environment hides it.
 ''',
 '''
 import { scene, shape, material, bsdf, ior, light, camera, engine as E, fx, units as u } from 'candela';

 const diamondIOR = ior.sellmeier({ B: [0.3306, 4.3356, 0], C: [0.1750 ** 2, 0.1060 ** 2, 0] });
 const gem = shape.sdf(p => {
   const q = p.P.abs();
   const oct = q.x.add(q.y.mul(1.35)).add(q.z).sub(0.12).mul(0.55);
   return fx.max(oct, p.P.y.sub(0.05));                       // a flat table on top
 }, { bound: 0.15 });

 export default scene()
   .add(gem.at(0, 0.13, 0).rotateY(u.deg(22)).material(material(bsdf.dielectric({ ior: diamondIOR }))))
   .add(shape.cylinder(0.06, 0.04).at(0, 0.02, 0).material(material.pbr().baseColor(0.05).roughness(0.3)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.04).roughness(0.5)))
   .light(light.point().at(-1.2, 2.2, 1.0).power(u.lm(9000)).temperature(u.K(5600)).radius(0.03))
   .light(light.point().at(1.4, 1.6, 0.4).power(u.lm(6000)).temperature(u.K(5600)).radius(0.03))
   .light(light.env.studio({ intensity: u.nit(120) }))
   .camera(camera.thinLens().at(0, 0.42, 0.62).lookAt(0, 0.1, 0).focal(u.mm(90)).fstop(8));

 export const engine = E.offline().spectral();
 ''')
P('S-03','bubbles','Soap bubbles','Spectral','Free thin films of water, 250 to 900 nm thick: interference colours, traced at single wavelengths.',
 ['Make one bubble very thin (< 100 nm) — why does it turn black?','Compare spectral and RGB rendering'], ['renderer'],
 '''
 # Soap bubbles

 A soap bubble is a **thin dielectric** — a film with two surfaces and no inside — whose thickness is comparable to the wavelength of light. Reflections from its two faces interfere:

 - at 100 nm and below, the two reflections cancel (a phase flip at one face) and the film looks **black**;
 - around 300–600 nm, first-order colours: yellow, magenta, blue;
 - above 1000 nm, the orders overlap and the colours fade to white.

 In the spectral engine, each path carries one wavelength, so the Airy reflectance is evaluated exactly per sample.
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, units as u } from 'candela';

 const nm = [90, 250, 380, 520, 700, 900];
 export default scene()
   .add(nm.map((d, i) => shape.sphere(0.18 + (i % 3) * 0.05).at((i - 2.5) * 0.5, 0.55 + (i % 2) * 0.25, (i % 3) * -0.2).material(material.soapFilm({ thickness: u.nm(d) }))))
   .add(shape.plane(30).material(material.pbr().baseColor(0.04).roughness(0.5)))
   .add(shape.rect(6, 3).at(0, 1.5, -1.5).rotateX(u.deg(90)).material(material.pbr().baseColor(0.04)))
   .light(light.env.studio({ intensity: u.nit(1100) }))
   .camera(camera.thinLens().at(0, 0.8, 3.2).lookAt(0, 0.6, 0).focal(u.mm(40)));

 export const engine = E.offline().spectral();
 ''')
P('S-04','blackbody','Incandescence','Spectral','A poker heated at one end: its colour is Planck’s law along a temperature field, and its luminance spans six orders of magnitude.',
 ['Make the hot end 2500 K','At what temperature does steel start to glow visibly?'], ['units'],
 '''
 # Incandescence

 Every hot body glows with the spectrum of a blackbody at its temperature. Two things change together as it heats:

 - **colour** — the peak moves from infrared toward visible: dull red (≈ 900 K), orange (1300 K), yellow (1800 K), white (≥ 5000 K);
 - **brightness** — near 555 nm, Wien's approximation gives $L \\propto e^{-c_2 / \\lambda T}$ with $c_2/\\lambda \\approx 25\\,900$ K. From 1000 to 2000 K the luminance rises about **400 000 times**.

 The poker's emission is a field of position: temperature falls along its length, `fx.blackbody(T)` gives the colour at luminance 1, and the Wien factor gives the brightness. The row of spheres shows 1000 → 2000 K at equal luminance, so you see only the colour change.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({ hot: param.kelvin(1900).range(1000, 3000).label('Hot end (K)') });
 const temp = p => fx.float(1).sub(p.local.y.add(0.6).div(1.2).clamp(0, 1)).pow(1.6).mul(P.hot.sub(500)).add(500);
 const wien = T => fx.pow(Math.E, fx.float(-25924).div(T).add(25924 / 2000)).mul(4000);   // nit, 4000 at 2000 K
 const poker = material.pbr().baseColor(0.05).roughness(0.6).emission(p => fx.blackbody(temp(p)).mul(wien(temp(p))), u.nit(1));

 const T = [1000, 1200, 1400, 1600, 1800, 2000];
 export default scene().params(P)
   .add(shape.cylinder(0.025, 1.2).at(0, 0.4, 0).rotateZ(u.deg(75)).material(poker))
   .add(T.map((k, i) => shape.sphere(0.1).at((i - 2.5) * 0.3, 0.1, 0.6).material(material.emissive('#000000', u.nit(1)).emission(fx.blackbody(k), u.nit(200)))))
   .add(shape.plane(30).material(material.pbr().baseColor(0.08).roughness(0.7)))
   .light(light.env.uniform(u.nit(0.5)))
   .camera(camera.thinLens().at(0, 1.0, 2.8).lookAt(0, 0.22, 0.3).focal(u.mm(40)));
 ''', focus='params')
P('C-01','depth-of-field','Depth of field','Camera','Aperture and focus distance as sliders: a thin lens blurs everything off the focal plane by its circle of confusion.',
 ['Focus on the farthest pawn','What f-number keeps all five sharp?','Compute the hyperfocal distance for this lens'], ['sensor'],
 '''
 # Depth of field

 A thin lens of focal length $f$ at f-number $N$ has an aperture of diameter $f/N$. A point at distance $d$ when the lens is focused at $s$ images to a disc — the **circle of confusion** — of diameter

 $$c = \\frac{f^2}{N}\\,\\frac{|d - s|}{d\\,(s - f)}$$

 The camera samples a point on the aperture for every path, aimed at the focal plane, so the blur is physically correct: foreground and background blur differently, highlights become discs (see **Bokeh**).

 Both sliders are live: moving them updates two uniforms, no rebuild.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({
   N: param.float(1.8).range(1.2, 22).scale('log').label('f-number'),
   focus: param.length(2.6).range(0.8, 8).label('Focus (m)'),
 });

 const pawn = c => scene.group([
   shape.cylinder(0.12, 0.05).at(0, 0.025, 0),
   shape.cone(0.09, 0.3).at(0, 0.2, 0),
   shape.sphere(0.07).at(0, 0.38, 0),
 ].map(s => s.material(material.pbr().baseColor(c).roughness(0.3).coat(1))));

 export default scene().params(P)
   .add([0, 1, 2, 3, 4].map(i => pawn(i % 2 ? '#e8e0d0' : '#3a322c').at(-0.4 + i * 0.25, 0, 1 - i * 1.1)))
   .add(shape.plane(40).material(material.pbr().baseColor(0.3).roughness(0.5)))
   .light(light.env.studio({ intensity: u.nit(800), rotate: u.deg(-30) }))
   .camera(camera.thinLens().at(-0.6, 0.5, 3.6).lookAt(0.2, 0.2, -1).focal(u.mm(85)).fstop(P.N).focus(P.focus));
 ''', focus='params')
P('C-02','bokeh','Bokeh and blades','Camera','Out-of-focus highlights take the shape of the aperture: a disc, or a polygon with as many sides as the iris has blades.',
 ['Try 5 blades, then 9','Rotate the blades by 15°'], ['sensor'],
 '''
 # Bokeh and blades

 Every out-of-focus point of light becomes an image of the **aperture**. With a perfect circular aperture (`blades(0)`), that is a disc; a real iris is a polygon of $n$ straight blades.

 The camera samples the aperture shape directly — a disc, or a regular polygon by triangle sampling — so the highlights are exact, not a post effect.

 The fairy lights are small emissive spheres far behind a sharp subject at f/1.4.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({ blades: param.int(6).range(0, 12).label('Blades').static(), rot: param.angle(u.deg(0)).range(u.deg(0), u.deg(60)).label('Blade rotation').static() });
 const bulbs = scene.group((g, { rng }) => {
   for (let i = 0; i < 40; i++) g.add(shape.sphere(0.04).at((rng() - 0.5) * 3.2, 0.2 + rng() * 1.6, -3 - rng() * 3)
     .material(material.emissive(['#ffd28a', '#ffb060', '#fff0d0'][i % 3], u.nit(4000))));
 });

 export default scene().params(P)
   .add(bulbs)
   .add(shape.sphere(0.25).at(0, 0.75, 0).material(material.metal('Au', { roughness: 0.15 })).id('ornament'))
   .add(shape.cylinder(0.3, 0.5).at(0, 0.25, 0).material(material.pbr().baseColor(0.12).roughness(0.4)))
   .light(light.env.gradient({ top: '#1a2030', bottom: '#050505', intensity: u.nit(10) }))
   .add(shape.rect(0.5, 0.5).at(0.7, 1.3, 1.0).facing(0, 0.75, 0).emit(light.area().power(u.lm(900)).temperature(u.K(3400))))
   .camera(camera.thinLens().at(0, 0.85, 1.6).lookAt(0, 0.75, 0).focal(u.mm(85)).fstop(1.4).focusOn('#ornament').blades(P.blades.value).bladeRotation(P.rot.value));
 ''', focus='params')
P('C-03','dolly-zoom','Focal length and perspective','Camera','The subject stays the same size; the background does not. Perspective depends on where you stand, not on the lens.',
 ['Set 24 mm and 200 mm and compare the background','Why do portrait photographers prefer 85 mm?'], ['sensor'],
 '''
 # Focal length and perspective

 A longer lens magnifies; walking back shrinks. Do both in proportion and the subject keeps its size while everything behind it changes — the "dolly zoom" from *Vertigo*.

 Here the camera distance is tied to the focal length: $d = 40 f$. At 24 mm you stand ~1 m away and the corridor stretches; at 200 mm you are 8 m back and the far wall looms. Perspective — the relative size of near and far things — depends only on camera position.

 The focal length is a **static** param (it changes the projection), the distance a host function of it (`P.f.map(f => f * 40)`).
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({ f: param.float(50).range(18, 200).scale('log').label('Focal length (mm)').static() });
 const f = P.f.value;
 const col = material.pbr().baseColor('#d8d0c0').roughness(0.6);

 export default scene().params(P)
   .add(scene.group(g => { for (let i = 0; i < 12; i++) { g.add(shape.box(0.3, 2.6, 0.3).at(-1.4, 1.3, -i * 1.6).material(col)); g.add(shape.box(0.3, 2.6, 0.3).at(1.4, 1.3, -i * 1.6).material(col)); } }))
   .add(shape.rect(4, 3).at(0, 1.5, -18).rotateX(u.deg(90)).material(material.pbr().baseColor('#7a2a20')))
   .add(shape.sphere(0.3).at(0, 1.0, 1).material(material.pbr().baseColor('#2e6fa8').roughness(0.3)).id('subject'))
   .add(shape.plane().material(material.pbr().baseColor(0.35)))
   .light(light.daylight({ elevation: u.deg(60), azimuth: u.deg(20) }))
   .camera(camera.thinLens().at(0, 1.1, 1 + f / 1000 * 40).lookAt(0, 1.0, 1).focal(u.mm(f)).fstop(8));
 ''', focus='params')
P('C-04','exposure','The exposure triangle','Camera','Aperture, shutter and ISO set the exposure together; each stop of one can be traded for a stop of another.',
 ['Find three settings that give the same EV','Turn on false colour and expose the grey card to middle grey'], ['sensor','exposure'],
 '''
 # The exposure triangle

 $$EV_{100} = \\log_2\\frac{N^2}{t} - \\log_2\\frac{S}{100}$$

 Opening the aperture one stop ($N \\div \\sqrt 2$), doubling the shutter time or doubling the ISO each add one stop of exposure. The sensor saturates at $L_{max} = 1.2 \\cdot 2^{EV_{100}}$ nit (ISO 2720 saturation-based speed), so the image brightness depends on EV alone.

 The scene is a sunlit street corner. Start at f/8, 1/250 s, ISO 100 (EV 14), then trade.

 > **Try it.** Turn on **False colour** in the viewport toolbar: the grey card should sit in the middle-grey band.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({
   N: param.float(8).range(1.4, 22).scale('log').label('f-number').static(),
   t: param.float(1 / 250).range(1 / 4000, 1 / 8).scale('log').label('Shutter (s)').static(),
   iso: param.float(100).range(50, 6400).scale('log').label('ISO').static(),
 });

 export default scene().params(P)
   .add(shape.box(0.4, 0.6, 0.02).at(0, 0.5, 0.3).rotateY(u.deg(-15)).material(material.pbr().baseColor(0.18)).id('grey-card'))
   .add(shape.box(2.4, 3, 2.4).at(-2, 1.5, -2).material(material.pbr().baseColor('#b8866a').roughness(0.9)))
   .add(shape.box(2.4, 2.4, 2.4).at(2.2, 1.2, -2.6).material(material.pbr().baseColor('#d8d0c0').roughness(0.9)))
   .add(shape.sphere(0.3).at(0.8, 0.3, 0.6).material(material.plastic('#c03020', 0.3)))
   .add(shape.plane().material(material.pbr().baseColor(0.25).roughness(0.9)))
   .light(light.sun().elevation(u.deg(45)).azimuth(u.deg(220)))
   .light(light.sky.physical({ turbidity: 3 }).fromSun())
   .camera(camera.thinLens().at(0.4, 1.4, 4).lookAt(0, 0.6, 0).focal(u.mm(35))
     .fstop(P.N.value).shutter(P.t.value).iso(P.iso.value));
 ''', focus='params')
P('C-05','tonemaps','Tone mapping','Camera','Saturated lights far brighter than white: AgX desaturates gracefully, ACES shifts hues, Reinhard and Linear clip differently.',
 ['Compare blue neon under AgX and ACES','Which tone map keeps the sky and the lamp both readable?'], ['exposure'],
 '''
 # Tone mapping

 The renderer computes **luminance in nits**. A display shows at most a few hundred. A tone map compresses the range — and its choices matter most for bright, saturated colours:

 | | |
 | --- | --- |
 | **AgX** | desaturates toward white as things brighten, like film; hues stay put |
 | **ACES** | filmic contrast, but strong blues shift toward purple |
 | **PBR Neutral** | keeps base colours accurate up to the shoulder |
 | **Filmic** | a classic S-curve |
 | **Reinhard** | $L/(1+L)$ per channel: saturated highlights stay saturated |
 | **Linear** | clips at white |

 The tone map is a param here (it rebuilds the display pass); the viewport toolbar also has an override.
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, pass, param, params, units as u } from 'candela';

 const P = params({ tm: param.choice(['agx', 'aces', 'neutral', 'filmic', 'reinhard', 'linear'], 'agx').label('Tone map') });
 const neon = c => material.emissive(c, u.nit(3000));

 export default scene().params(P)
   .add(shape.capsule(0.05, 1.2).at(-0.9, 1.0, -0.6).material(neon('#2040ff')))
   .add(shape.capsule(0.05, 1.2).at(0, 1.0, -0.6).material(neon('#ff2010')))
   .add(shape.capsule(0.05, 1.2).at(0.9, 1.0, -0.6).material(neon('#20ff40')))
   .add(shape.sphere(0.35).at(0, 0.35, 0.2).material(material.pbr().baseColor(0.7).roughness(0.3)))
   .add(shape.rect(5, 3).at(0, 1.5, -0.8).rotateX(u.deg(90)).material(material.pbr().baseColor(0.5).roughness(0.8)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.4)))
   .camera(camera.thinLens().at(0, 1.0, 3).lookAt(0, 0.8, 0).focal(u.mm(35)));

 export const engine = E.realtime().post(pass.tonemap(P.tm.value));
 ''', focus='params')
P('C-06','lens-effects','Bloom, vignette, grain','Camera','Display passes that imitate a lens and a film: each is a small kernel after the tone map, with its own params.',
 ['Turn everything off and compare','Write a pass of your own (see Engines → A custom pass)'], ['exposure'],
 '''
 # Bloom, vignette, grain

 - **Bloom** — light scattered inside the lens spreads bright points into a glow. Here a blur of the HDR pixels above the white point, added back.
 - **Vignette** — natural falloff: a thin lens's illuminance drops as $\\cos^4\\theta$ off axis.
 - **Grain** — film's silver halide (or a sensor's shot noise) as per-pixel noise, stronger in the mid-tones.

 They run after accumulation, in the display pass, so changing them never restarts the render.
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, pass, param, params, units as u } from 'candela';

 const P = params({
   bloom: param.float(0.4).range(0, 1).label('Bloom').static(),
   vignette: param.float(0.6).range(0, 1).label('Vignette').static(),
   grain: param.float(0.1).range(0, 1).label('Grain').static(),
 });

 export default scene().params(P)
   .add(scene.group(g => { for (let i = 0; i < 7; i++) g.add(shape.sphere(0.04).at((i - 3) * 0.35, 1.3, -1.2).material(material.emissive('#ffe0b0', u.nit(30000)))); }))
   .add(shape.roundedBox(0.8, 0.5, 0.5, 0.06).at(0, 0.25, 0).material(material.carPaint('#16305a')))
   .add(shape.plane(30).material(material.pbr().baseColor(0.15).roughness(0.3)))
   .light(light.env.gradient({ top: '#30384a', bottom: '#0a0a0a', intensity: u.nit(40) }))
   .camera(camera.thinLens().at(0, 0.7, 2.4).lookAt(0, 0.4, 0).focal(u.mm(40)));

 export const engine = E.realtime().post(pass.tonemap('agx'), pass.bloom({ strength: P.bloom.value }), pass.vignette({ strength: P.vignette.value }), pass.grain({ amount: P.grain.value }));
 ''', focus='params')
P('E-01','aovs','Integrators: what the denoiser sees','Engines','The same scene through six integrators: path tracing, albedo, normals, depth, ambient occlusion — and what each is for.',
 ['Which AOVs does the denoiser use?','Set AO radius to 2 m'], ['renderer','monte-carlo'],
 '''
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
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, integrator, fx, param, params, units as u } from 'candela';

 const P = params({ view: param.choice(['path', 'albedo', 'normals', 'depth', 'ao'], 'path').label('Integrator') });
 const brick = material.pbr().roughness(0.8).baseColor(p => fx.mix(fx.color('#8a3a24'), fx.color('#c8bca8'), fx.noise.voronoi(p.P.mul(5)).edge.smoothstep(0.05, 0.0)));

 export default scene().params(P)
   .add(shape.torus(0.4, 0.15).at(-0.8, 0.55, 0).rotateX(u.deg(70)).material(material.metal('Cu', { roughness: 0.25 })))
   .add(shape.roundedBox(0.7, 0.7, 0.7, 0.08).at(0.5, 0.35, -0.3).rotateY(u.deg(30)).material(brick))
   .add(shape.sphere(0.3).at(0.4, 0.3, 0.7).material(material.glass({ ior: 1.5 })))
   .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
   .light(light.daylight({ elevation: u.deg(40), azimuth: u.deg(50) }))
   .camera(camera.thinLens().at(0, 1.4, 3.2).lookAt(0, 0.35, 0).focal(u.mm(38)));

 export const engine = E.realtime().integrator(P.view.pick({
   path: integrator.path(), albedo: integrator.albedo(), normals: integrator.normals(), depth: integrator.depth(), ao: integrator.ao({ radius: 0.8 }),
 }));
 ''', focus='params')
P('E-02','toon','A custom integrator: toon shading','Engines','integrator.define with a kernel traced from JS: intersect, test a shadow ray, quantise the light into bands.',
 ['Add a rim light term','Make it a single-bounce “direct lighting only” integrator instead'], ['architecture','renderer'],
 '''
 # A custom integrator: toon shading

 ```js
 integrator.define('toon', { kernel: ({ ray, scene }, P) => { … return colour } })
 ```

 The kernel is a **traced lambda**, like a material field — `scene.intersect(ray)` returns a symbolic hit with `P`, `N`, `albedo`, `missed`; `scene.occluded(o, d)` is a shadow ray; `scene.sunDir` is the sun. JS runs once to build the graph; the result is WGSL, then GLSL for WebGL2.

 Here: Lambert's $N \\cdot L$ against the sun, quantised into bands, darkened in shadow, with an ink outline where the normal turns away from the camera.
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, integrator, fx, param, units as u } from 'candela';

 const toon = integrator.define('toon', {
   params: { bands: param.float(3).range(2, 6) },
   kernel: ({ ray, scene }, P) => {
     const hit = scene.intersect(ray);
     const ndl = hit.N.dot(scene.sunDir).max(0);
     const band = ndl.mul(P.bands).floor().div(P.bands);
     const lit = fx.select(scene.occluded(hit.P.add(hit.Ng.mul(0.002)), scene.sunDir, 1000), 0.35, 1.0);
     const rim = hit.N.dot(ray.d.neg()).smoothstep(0.12, 0.3);                 // ink at grazing angles
     const col = hit.albedo.mul(band.mul(lit).mul(0.85).add(0.2)).mul(rim);
     return fx.select(hit.missed, fx.color('#dfe8f0'), col);
   },
 });

 export default scene()
   .add(shape.sphere(0.45).at(-0.6, 0.45, 0).material(material.pbr().baseColor('#e05a3c')))
   .add(shape.torus(0.32, 0.12).at(0.55, 0.4, 0.1).rotateX(u.deg(60)).material(material.pbr().baseColor('#3c8ae0')))
   .add(shape.cone(0.3, 0.7).at(0.1, 0.35, -0.8).material(material.pbr().baseColor('#f0c040')))
   .add(shape.plane(30).material(material.pbr().baseColor('#c8d8a0')))
   .light(light.sun().elevation(u.deg(45)).azimuth(u.deg(60)))
   .camera(camera.thinLens().at(0, 1.3, 3.2).lookAt(0, 0.35, 0).focal(u.mm(40)));

 export const engine = E.realtime().integrator(toon()).denoise(false);
 ''', focus='shader')
P('E-03','bounces','How many bounces?','Engines','Max depth from 1 to 12 in a white room: direct light only, then each bounce adds less — and the room fills with colour bleeding.',
 ['What fraction of the light arrives after the 3rd bounce?','Turn off Russian roulette'], ['monte-carlo'],
 '''
 # How many bounces?

 With max depth 1 you see only direct light — shadows are black. Each extra bounce adds the light reflected once more, multiplied by the albedo (≈ 0.7 here), so the series converges like $\\sum \\rho^k$: a white room needs many bounces, a dark one few.

 **Russian roulette** makes deep paths cheap without bias: after a few bounces, a path continues with probability $q$ and its weight is divided by $q$.

 Watch the red and green walls tint the floor and the white blocks — colour bleeding is an indirect effect.
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, integrator, param, params, units as u } from 'candela';

 const P = params({ depth: param.int(4).range(1, 12).label('Max depth').static() });
 const white = material.pbr().baseColor(0.72).roughness(0.9);

 export default scene().params(P)
   .add(shape.rect(3, 3).at(0, 0, 0).material(white))
   .add(shape.rect(3, 3).at(0, 3, 0).rotateX(u.deg(180)).material(white))
   .add(shape.rect(3, 3).at(0, 1.5, -1.5).rotateX(u.deg(90)).material(white))
   .add(shape.rect(3, 3).at(-1.5, 1.5, 0).rotateZ(u.deg(-90)).material(material.pbr().baseColor('#a8231c').roughness(0.9)))
   .add(shape.rect(3, 3).at(1.5, 1.5, 0).rotateZ(u.deg(90)).material(material.pbr().baseColor('#2a8a3a').roughness(0.9)))
   .add(shape.box(0.8, 1.6, 0.8).at(-0.5, 0.8, -0.4).rotateY(u.deg(18)).material(white))
   .add(shape.box(0.8).at(0.55, 0.4, 0.4).rotateY(u.deg(-18)).material(white))
   .add(shape.rect(0.8, 0.8).at(0, 2.99, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(4000)).temperature(u.K(4500))))
   .camera(camera.thinLens().at(0, 1.5, 5.2).lookAt(0, 1.4, 0).focal(u.mm(35)));

 export const engine = E.offline().integrator(integrator.path({ maxDepth: P.depth.value, rr: { after: 3 } }));
 ''', focus='params')
P('E-04','mis','NEE, BSDF sampling, MIS','Engines','Veach’s test: four glossy plates, four lights of different sizes. Each sampling strategy fails somewhere; multiple importance sampling never does.',
 ['Explain which strategy wins on which plate','Look at the noise with denoising off'], ['monte-carlo'],
 '''
 # NEE, BSDF sampling, MIS

 The classic scene from Eric Veach's thesis (1997). Four plates go from sharp to rough (top to bottom); four spherical lights go from tiny to large (left to right), with equal power.

 - **BSDF sampling** follows the material's lobe: perfect for sharp plates and big lights, hopeless for tiny lights on rough plates.
 - **Light sampling (NEE)** aims at the lights: perfect for small lights on rough plates, noisy for big lights on sharp plates.
 - **MIS** (power heuristic) uses both and weights each sample by how likely the *other* strategy was to produce it.

 > **Try it.** Switch the **Strategy** param and turn **Denoise** off in the viewport.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, engine as E, integrator, param, params, units as u } from 'candela';

 const P = params({ strategy: param.choice(['MIS', 'BSDF only', 'lights only'], 'MIS').label('Strategy') });
 const rough = [0.04, 0.12, 0.25, 0.45];
 const plates = rough.map((r, i) => shape.box(4, 0.04, 0.7).at(0, 0.3 + i * 0.25, -i * 0.65).rotateX(u.deg(18 + i * 6))
   .material(material(bsdf.conductor.schlick({ f0: 0.8, roughness: r }))));
 const radii = [0.02, 0.06, 0.18, 0.45], cols = ['#ff7040', '#ffd040', '#60ff80', '#4090ff'];

 export default scene().params(P)
   .add(plates)
   .light(radii.map((r, i) => light.point().at((i - 1.5) * 1.1, 2.4, -2.6).power(u.lm(3000)).color(cols[i]).radius(r)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.05)))
   .camera(camera.thinLens().at(0, 2.4, 3.6).lookAt(0, 0.6, -0.8).focal(u.mm(35)));

 export const engine = E.offline().integrator(P.strategy.pick({
   'MIS': integrator.path({ nee: true, mis: 'power' }),
   'BSDF only': integrator.path({ nee: false }),
   'lights only': integrator.path({ nee: true, mis: 'none' }),
 }));
 ''', focus='params')
P('E-05','clamp','Fireflies and the clamp','Engines','A small bright light seen through glass makes rare, huge samples. Clamping them removes the fireflies — and some energy.',
 ['Set clamp to 0 (off) and watch the floor','How much energy does clamp = 4 remove?'], ['monte-carlo','invariants'],
 '''
 # Fireflies and the clamp

 Light focused by a glass sphere onto the floor — a **caustic** — can only be found by BSDF sampling: a path from the floor must happen to pass through the sphere and hit the small light. When it does, its weight is enormous: a **firefly**.

 `integrator.path({ clamp: k })` caps each path's throughput after the first bounce. It works, and it is **biased**: the caustic gets dimmer, and the Console says so (**I460**).

 The honest fix is a better estimator (bidirectional methods, path guiding); the clamp is a practical knob, labelled as such.
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, integrator, param, params, units as u } from 'candela';

 const P = params({ clamp: param.float(0).range(0, 20).label('Clamp (0 = off)').static() });

 export default scene().params(P)
   .add(shape.sphere(0.35).at(0, 0.35, 0).material(material.glass({ ior: 1.5 })))
   .add(shape.cube(0.4).at(-0.9, 0.2, -0.4).rotateY(u.deg(25)).material(material.pbr().baseColor('#c06030')))
   .add(shape.plane(30).material(material.pbr().baseColor(0.7).roughness(0.9)))
   .add(shape.sphere(0.05).at(0.8, 1.6, -0.6).emit(light.area().power(u.lm(4000)).temperature(u.K(4000))))
   .light(light.env.uniform(u.nit(15)))
   .camera(camera.thinLens().at(0, 1.4, 2.6).lookAt(0, 0.2, 0).focal(u.mm(40)));

 export const engine = E.offline().integrator(integrator.path({ clamp: P.clamp.value || undefined }));
 ''', focus='params')
P('E-06','custom-pass','A custom pass','Engines','pass.define: a display-stage kernel traced from JS — a duotone posteriser with two colours and a level count as sliders.',
 ['Add a third tone','Make it an HDR-stage pass that runs before tone mapping'], ['architecture'],
 '''
 # A custom pass

 ```js
 const duotone = pass.define('duotone', {
   params: { levels: param.float(5).range(2, 12), dark: param.color(…), light: param.color(…) },
   stage: 'display',
   kernel: ({ color }, P) => fx.mix(P.dark, P.light, color.luminance().mul(P.levels).floor().div(P.levels)),
 });
 ```

 A pass sees the pixel's `color` (HDR or display-referred, by stage), `uv`, the `albedo` and `normal` guides and the `luminance`. Its params become sliders that don't restart the render — passes run after accumulation.
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, pass, fx, param, units as u } from 'candela';

 const duotone = pass.define('duotone', {
   params: { levels: param.float(5).range(2, 12), dark: param.color('#1b2a4a'), light: param.color('#f2d8a8') },
   stage: 'display',
   kernel: ({ color }, P) => fx.mix(P.dark, P.light, color.luminance().mul(P.levels).floor().div(P.levels.sub(1)).clamp(0, 1)),
 });

 export default scene()
   .add(shape.sphere(0.5).at(-0.6, 0.5, 0).material(material.pbr().baseColor(0.8).roughness(0.3)))
   .add(shape.torus(0.35, 0.13).at(0.6, 0.45, 0.2).rotateX(u.deg(60)).material(material.pbr().baseColor(0.6)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.5)))
   .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(70) }))
   .camera(camera.thinLens().at(0, 1.2, 3.2).lookAt(0, 0.45, 0).focal(u.mm(40)));

 export const engine = E.realtime().post(pass.tonemap('agx'), duotone());
 ''', focus='params')
P('E-07','engines','Realtime, preview, offline','Engines','Three engine presets: what they trade — resolution, bounces, denoising, samples per frame.',
 ['Which engine converges fastest to a clean image here?','Make a custom engine with 8 bounces at half resolution'], ['renderer'],
 '''
 # Realtime, preview, offline

 | engine | resolution | bounces | denoise | notes |
 | --- | --- | --- | --- | --- |
 | `preview()` | ½ | 3 | yes | for editing; fast feedback |
 | `realtime()` | 1 | 5 | yes | the default |
 | `offline()` | 1 | 12 | no | MIS everywhere, unbiased, slower to look clean |

 An engine is a builder too: `engine.offline().scale(0.5).maxDepth(8).denoise(true)` is a valid custom engine. The viewport's engine switch overrides the scene's choice without editing it.
 ''',
 '''
 import { scene, shape, material, light, camera, engine as E, param, params, units as u } from 'candela';

 const P = params({ which: param.choice(['preview', 'realtime', 'offline'], 'realtime').label('Engine') });

 export default scene().params(P)
   .add(shape.sphere(0.4).at(-0.5, 0.4, 0).material(material.glass({ ior: 1.5 })))
   .add(shape.roundedBox(0.6, 0.6, 0.6, 0.06).at(0.5, 0.3, -0.2).rotateY(u.deg(25)).material(material.metal('Cu', { roughness: 0.3 })))
   .add(shape.plane(30).material(material.pbr().baseColor(0.6).roughness(0.8)))
   .add(shape.rect(0.6, 0.6).at(0, 2, 0.5).facing(0, 0, 0).emit(light.area().power(u.lm(3000))))
   .light(light.env.uniform(u.nit(20)))
   .camera(camera.thinLens().at(0, 1.1, 2.8).lookAt(0, 0.3, 0).focal(u.mm(40)));

 export const engine = P.which.pick({ preview: E.preview(), realtime: E.realtime(), offline: E.offline() });
 ''', focus='params')
P('X-01','backends','One kernel, two backends','GPU','The path tracer is written once in a strict subset of WGSL; a line-level translator makes the GLSL ES 3.0 version for WebGL2.',
 ['Switch the backend in the status bar and compare the images','Find the select() → ternary rewrite in the GLSL'], ['gpu'],
 '''
 # One kernel, two backends

 | | WebGPU | WebGL2 |
 | --- | --- | --- |
 | kernel | compute shader, one thread per pixel | fragment shader over a full-screen triangle |
 | scene data | storage buffers | RGBA32F textures, 1024 texels wide |
 | accumulation | storage buffer | ping-pong float render targets |
 | language | WGSL (as written) | GLSL ES 3.0 (translated) |

 The **Shader** view shows all three: the generated WGSL, its GLSL translation, and the source the active backend compiled. Both backends render the same image to within noise — that's tested.

 The translator handles what this subset uses: structs, `let`/`var`, `loop`, `select` (as a ternary), arrays, `bitcast`, `atan2`. It is about 150 lines, not a compiler.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 export default scene()
   .add(shape.sphere(0.45).at(-0.6, 0.45, 0).material(material.metal('Au', { roughness: 0.2 })))
   .add(shape.torus(0.32, 0.12).at(0.55, 0.4, 0.1).rotateX(u.deg(60)).material(material.plastic('#1e4bb3', 0.25)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
   .light(light.daylight({ elevation: u.deg(40), azimuth: u.deg(40) }))
   .camera(camera.thinLens().at(0, 1.2, 3.2).lookAt(0, 0.4, 0).focal(u.mm(40)));
 ''', focus='shader')
P('X-02','ten-thousand','Ten thousand spheres','GPU','A 100 × 100 grid of instances: the BVH keeps tracing logarithmic, and one material colours them all by instance.',
 ['Make it 200 × 200 and watch the frame time','Animate the wave with fx.time'], ['gpu'],
 '''
 # Ten thousand spheres

 Ten thousand objects is nothing special for a BVH: a ray descends about $\\log_2 10^4 \\approx 13$ levels, testing a few boxes at each. The packing (surface-area heuristic, binned) takes a few tens of milliseconds on the CPU at build time; the scene data is ~1 MB of floats.

 Heights come from JS at build time; colours from `p.instance.random` at render time. Check the stats in the status bar and the Console.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const N = 100, s = 0.06;
 const ball = shape.sphere(s * 0.45);
 const m = material.pbr().roughness(0.3).baseColor(p => fx.ramp(p.instance.random, [[0, '#f04a2a'], [0.33, '#f0c02a'], [0.66, '#2ab0f0'], [1, '#f0f0f0']]));

 const grid = scene.group(g => {
   for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
     const x = (i - N / 2) * s, z = (j - N / 2) * s;
     g.add(ball.at(x, s * 0.45 + 0.25 * Math.sin(x * 2.2) * Math.cos(z * 1.7) + 0.25, z).material(m));
   }
 });

 export default scene()
   .add(grid)
   .add(shape.plane(40).material(material.pbr().baseColor(0.1)))
   .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(140) }))
   .camera(camera.thinLens().at(3.6, 2.4, 3.6).lookAt(0, 0.1, 0).focal(u.mm(35)));
 ''')
P('X-03','planet','A procedural planet','GPU','A sphere-traced planet displaced by fractal noise, an ocean, and an exponential atmosphere — three lambdas, no textures.',
 ['Raise the sea level','Make the atmosphere thicker and redder'], ['gpu','media'],
 '''
 # A procedural planet

 - **Land** — an SDF: the sphere's distance minus a ridged fractal height, $d = |\\mathbf p| - R - h(\\hat{\\mathbf p})$. Not an exact distance any more, so the tracer steps conservatively (`lipschitz: 1.5`).
 - **Ocean** — a smooth sphere at sea level with a glossy dark-blue material.
 - **Atmosphere** — a heterogeneous medium whose density falls exponentially with altitude, $\\sigma(\\mathbf p) = \\sigma_0 e^{-(|\\mathbf p| - R)/H}$, bounded by a box. Its majorant is proved by interval arithmetic.

 Colours come from altitude and slope, like the terrain preset.
 ''',
 '''
 import { scene, shape, material, medium, phase, light, camera, fx, param, params, units as u } from 'candela';

 const R = 1.0;
 const P = params({ sea: param.float(0.012).range(-0.02, 0.06).label('Sea level').static() });
 const height = q => fx.noise.ridged(q.mul(2.2), { octaves: 6 }).mul(0.07).sub(0.035);
 const land = shape.sdf(p => p.P.length().sub(R).sub(height(p.P.normalize())), { bound: R * 1.12, lipschitz: 1.5 });
 const ground = material.pbr().roughness(0.85).baseColor(p => {
   const alt = p.P.length().sub(R);
   return fx.ramp(alt.mul(12).add(0.45), [[0, '#c8b080'], [0.3, '#4a6a2a'], [0.65, '#6a5a4a'], [0.9, '#f0f0f0']]);
 });
 const atmosphere = medium.heterogeneous({
   density: fx.field(p => fx.pow(Math.E, p.P.length().sub(R).mul(-1 / 0.05)).mul(3).mul(p.P.length().lt(R * 1.25).select(1, 0))),
   bounds: shape.box(2.6, 2.6, 2.6), albedo: 0.95, phase: phase.hg(0.6),
 });

 export default scene().params(P)
   .add(land.material(ground))
   .add(shape.sphere(R + P.sea.value).material(material.pbr().baseColor('#143c5e').roughness(0.08).specular(0.6)))
   .medium(atmosphere)
   .light(light.sun().elevation(u.deg(20)).azimuth(u.deg(60)).illuminance(u.lux(100000)))
   .light(light.env.night())
   .camera(camera.thinLens().at(0, 0.6, 4.2).lookAt(0, 0, 0).focal(u.mm(50)).exposure(14.5));
 ''', focus='params')
P('X-04','menger','Menger sponge','GPU','A fractal as a distance field: the JS loop unrolls three folding iterations into straight-line WGSL.',
 ['Change ITERATIONS to 4','Make it glass'], ['gpu','architecture'],
 '''
 # Menger sponge

 Start from a cube; remove the middle cross from each face; repeat on the remaining 20 sub-cubes. As a distance field this is a **fold** (Íñigo Quílez's formulation): take the position modulo the cell size, measure the distance to an infinite cross, and keep the maximum with the cube.

 ```js
 for (let k = 0; k < ITERATIONS; k++) { const a = p.mul(s).mod(2).sub(1); s *= 3; … d = fx.max(d, c); }
 ```

 `ITERATIONS` and `s` are JavaScript: the loop runs once, at build time, and writes `ITERATIONS` copies of the fold into the kernel. A field loop would need dynamic control flow on the GPU; an unrolled one is a straight line.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, units as u } from 'candela';

 const ITERATIONS = 3;
 const sponge = shape.sdf(p => {
   const q = p.P.div(0.6);
   const b = q.abs().sub(1);
   let d = fx.max(b, 0).length().add(fx.min(fx.max(b.x, fx.max(b.y, b.z)), 0));
   let s = 1;
   for (let k = 0; k < ITERATIONS; k++) {
     const a = q.mul(s).mod(2).sub(1);
     s *= 3;
     const r = a.abs().mul(-3).add(1).abs();
     const da = fx.max(r.x, r.y), db = fx.max(r.y, r.z), dc = fx.max(r.z, r.x);
     d = fx.max(d, fx.min(da, fx.min(db, dc)).sub(1).div(s));
   }
   return d.mul(0.6);
 }, { bound: 1.1 });

 export default scene()
   .add(sponge.at(0, 0.6, 0).rotateY(u.deg(30)).material(material.pbr().baseColor('#d8c8a8').roughness(0.5)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.8)))
   .light(light.sun().elevation(u.deg(40)).azimuth(u.deg(130)).illuminance(u.lux(60000)))
   .light(light.env.gradient({ top: '#a0b8d0', bottom: '#303030', intensity: u.nit(900) }))
   .camera(camera.thinLens().at(1.6, 1.5, 2.4).lookAt(0, 0.5, 0).focal(u.mm(35)));
 ''')
P('X-05','cache','Kernels are cached','GPU','Switch between three material variants: the first visit compiles a kernel, every later visit swaps the cached one in.',
 ['Switch variants a few times and watch the compile time in the status bar','Which edits rebuild, which repack, which only update a uniform?'], ['gpu','architecture'],
 '''
 # Kernels are cached

 Changes come in three costs:

 | change | cost |
 | --- | --- |
 | a **dynamic** param (most sliders) | a uniform write — the next frame |
 | a transform, a light's power, the clock | a repack of scene data — a millisecond |
 | a **static** param, a new material, a new shape kind | a new kernel — compiled once, then **cached by source** |

 The **Variant** param here is static: it picks one of three materials. The first time you choose each, the kernel compiles (seconds on a software GPU, tens of milliseconds on a real one). After that, switching is instant — the cache holds the compiled pipeline.
 ''',
 '''
 import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

 const P = params({ v: param.choice(['marble', 'brushed', 'glass'], 'marble').label('Variant') });
 const variants = {
   marble: material.pbr().roughness(0.2).coat(1).baseColor(p => fx.mix(fx.color('#30302e'), fx.color('#ece8e0'), p.P.x.mul(4).add(fx.noise.turbulence(p.P.mul(2)).mul(3)).sin().abs().pow(0.3))),
   brushed: material.metal('Al', { roughness: 0.3 }),
   glass: material.glass({ ior: 1.5, absorb: '#a0d0e0', distance: u.cm(30) }),
 };

 export default scene().params(P)
   .add(shape.torus(0.45, 0.18).at(0, 0.6, 0).rotateX(u.deg(65)).material(P.v.pick(variants)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.35)))
   .light(light.env.studio({ intensity: u.nit(900) }))
   .camera(camera.thinLens().at(0, 1.3, 2.8).lookAt(0, 0.5, 0).focal(u.mm(42)));
 ''', focus='params')
