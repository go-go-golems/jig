from mk import P
P('B-03','values','Builders are values','Basics','Every call returns a new builder. Sharing is free: one sphere, one material kernel, many instances.',
 ['Show me in the Graph which nodes are shared','Make the blue spheres metallic without touching the red ones','How many material kernels did this compile to, and why?'], ['architecture','gpu'],
 '''
 # Builders are values

 `plastic` is defined once; `red` and `blue` are **new builders** derived from it. Nothing is mutated, so `plastic` is still there, unchanged, and every derived value shares the parts it did not change.

 That sharing survives compilation. Open the **Graph**: the `sphere` node has many parents, and so does each material. Open the **Console**: the note *I205* counts objects against material kernels — 25 spheres, two kernels. Materials with identical bodies are deduplicated; the BVH instances the geometry.

 > **Try it.** In `scene.js`, change `ball` to `shape.sphere(0.32)` and run: one edit, every instance changes. Then give the third column a third colour.

 Builders are immutable, so assigning to one is an error (**E105**). In the live world, *handles* are the mutable ones — see the Live presets.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const plastic = material.pbr().roughness(0.28);
 const red  = plastic.baseColor('#b3261e');
 const blue = plastic.baseColor('#1e4bb3');     // plastic is unchanged

 const ball = shape.sphere(0.3);                 // one geometry node, many instances

 const grid = scene.group(g => {
   for (let i = 0; i < 5; i++)
     for (let j = 0; j < 5; j++)
       g.add(ball.at((i - 2) * 0.75, 0.3, (j - 2) * 0.75).material((i + j) % 2 ? red : blue));
 });

 export default scene()
   .add(grid)
   .add(shape.plane(40).material(material.pbr().baseColor(0.5).roughness(0.7)))
   .light(light.daylight({ elevation: u.deg(55), azimuth: u.deg(40) }))
   .camera(camera.thinLens().at(0, 3.2, 4.6).lookAt(0, 0.2, 0).focal(u.mm(40)));
 ''')
P('B-04','diagnostics','Diagnostics, as you type','Basics','Builders check units, ranges and physics as you call them. Warnings here are deliberate; errors are one uncomment away.',
 ['Fix every warning in this scene','Uncomment the line with lumens as intensity and explain the error','What does W420 protect against?'], ['invariants','units'], 
 '''
 # Diagnostics, as you type

 This scene builds — with **three warnings**, on purpose. Open the **Console**:

 - **W330** — an albedo of 1.0. No real material reflects all light (fresh snow ≈ 0.9, charcoal ≈ 0.03); a perfect reflector makes indirect light converge slowly and look flat.
 - **W335** — `metallic(0.5)`: a surface is a metal or it is not. Partial values only make sense at texel boundaries.
 - **W420** — `bsdf.add` of a diffuse 0.8 and a mirror 0.9 reflects **1.70** times the light it receives. `mix` (convex) and `layer` (Fresnel-coupled) are valid by construction; `add` is checked.

 The commented lines at the bottom are **errors**. Uncomment one at a time and run:

 | line | code | why |
 | --- | --- | --- |
 | `.roughnes(0.4)` | E104 | did-you-mean, from the Proxy around every builder |
 | `.intensity(u.lm(800))` | E120 | lumens are flux; intensity is candela (Φ/4π for a point) |
 | `.fstop(0.4)` | E123 | N ≥ 0.5 for any lens in air (Abbe sine condition) |
 | `p.uv.x * 10` | E201 | JS arithmetic on a field: use `.mul(10)` |

 Every diagnostic points at **your** line: the builder captured its call site when you called it.
 ''',
 '''
 import { scene, shape, material, bsdf, light, camera, fx, units as u } from 'candela';

 const tooWhite = material.pbr().baseColor(1.0).roughness(0.5);                  // W330
 const halfMetal = material.pbr().baseColor('#c0a060').metallic(0.5);            // W335
 const tooBright = material(bsdf.add(bsdf.lambert(0.8),
                                     bsdf.conductor.schlick({ f0: 0.9, roughness: 0.2 })));   // W420

 // uncomment one at a time, then Run:
 // material.pbr().roughnes(0.4);
 // light.point().intensity(u.lm(800));
 // camera.thinLens().fstop(0.4);
 // fx.pattern(p => Math.sin(p.uv.x * 10));

 export default scene()
   .add(shape.sphere(0.5).at(-1.2, 0.5, 0).material(tooWhite))
   .add(shape.sphere(0.5).at(0, 0.5, 0).material(halfMetal))
   .add(shape.sphere(0.5).at(1.2, 0.5, 0).material(tooBright))
   .add(shape.plane(30).material(material.pbr().baseColor(0.3)))
   .light(light.env.studio({ intensity: u.nit(600) }))
   .camera(camera.thinLens().at(0, 1.4, 4.2).lookAt(0, 0.45, 0));
 ''', focus='console')
P('B-05','defaults','Defaults are announced','Basics','A scene with no camera and no lights still renders — and the Console says exactly what it assumed.',
 ['Add a camera and a light, then compare Explain before and after','What exposure did the meter choose, and why?'], ['sensor','exposure'],
 '''
 # Defaults are announced

 Nothing here says how to look or what lights the scene. The build fills both in — a 50 mm lens at (0, 1.2, 5), an automatic exposure — and **says so**: open **Console → Explain** and **Diagnostics** (I207, I208).

 With no lights, only emissive surfaces light the scene: the glowing panel is a material with `.emission(colour, u.nit(…))`, a surface radiating a luminance. It is not sampled as a light (it has no `.emit()`), so it lights the room through BSDF sampling alone — noisier, but correct.

 > **Try it.** Replace the panel's `.material(glow)` with `.emit(light.area().luminance(u.nit(2500)))` and run. The noise drops: the panel is now *also* sampled directly (next-event estimation), and the two strategies are combined with multiple importance sampling.
 ''',
 '''
 import { scene, shape, material, units as u } from 'candela';

 const glow = material.emissive('#ffe2bf', u.nit(2500));
 const wall = material.pbr().baseColor(0.6).roughness(0.9);

 export default scene()
   .add(shape.box(1.0).at(-0.7, 0.5, 0).rotateY(u.deg(20)).material(material.pbr().baseColor(0.6)))
   .add(shape.sphere(0.45).at(0.8, 0.45, 0.2).material(material.pbr().baseColor('#5a7fa8').roughness(0.2)))
   .add(shape.rect(2.4, 1.2).at(0, 2.4, -0.2).rotateX(u.deg(180)).material(glow))
   .add(shape.rect(8, 3).at(0, 1.5, -1.6).rotateX(u.deg(90)).material(wall))
   .add(shape.plane(20).material(material.pbr().baseColor(0.45)));
 ''')
P('L-01','lumens','Lumens, candela, nits','Light','The same 1200 lm as a bare point, a focused spot and a panel: the geometry of an emitter decides its intensity.',
 ['Meter the floor under each light and explain the readings','Make the panel twice as large with the same power — what happens to its luminance?','Convert 1200 lm to candela for each of the three'], ['units'],
 '''
 # Lumens, candela, nits

 Three lights, **the same flux** — 1200 lm each — and three very different pools of light. The flux is the same; how it is spread is not:

 $$I_{point} = \\frac{\\Phi}{4\\pi} = 95.5\\ \\mathrm{cd} \\qquad I_{spot} = \\frac{\\Phi}{2\\pi(1-\\cos\\theta)} = 3167\\ \\mathrm{cd}\\ (\\theta = 20°) \\qquad L_{panel} = \\frac{\\Phi}{\\pi A}$$

 The point light spreads its 1200 lm over the whole sphere; the spot's reflector puts all of it into a 20° cone, so the same lumens give **33 times** the intensity; the panel is a Lambertian area light, whose *luminance* (what a camera sees when looking at it) is $\\Phi/\\pi A$ = 764 nit for 0.5 m².

 > **Try it.** **Alt-click** the floor under each light to meter it (nit and EV). Then set the spot's `.powerMode('masked')`: a masked spot is a point light with a mask, so 1200 lm gives only 95.5 cd — the flux outside the cone is simply lost.

 Lights take flux (`.power(u.lm)`), intensity (`.intensity(u.cd)`), illuminance (`.illuminance(u.lux)`, the sun) or luminance (`.luminance(u.nit)`, areas). Mixing them up is **E120**.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const floor = material.pbr().baseColor(0.5).roughness(0.85);
 const wall = material.pbr().baseColor(0.35).roughness(0.9);

 export default scene()
   .add(shape.plane(30).material(floor))
   .add(shape.rect(12, 5).at(0, 2.5, -2).rotateX(u.deg(90)).material(wall))
   .light(light.point().id('bare').at(-2.4, 1.6, 0).power(u.lm(1200)).temperature(u.K(3000)).radius(0.04))
   .light(light.spot().id('spot').at(0, 2.2, 0.3).aim(0, 0, 0.3).power(u.lm(1200)).cone(u.deg(20)).softEdge(u.deg(4)).temperature(u.K(3000)))
   .add(shape.rect(1, 0.5).at(2.4, 2.0, 0.2).rotateX(u.deg(180)).emit(light.area().power(u.lm(1200)).temperature(u.K(3000))))
   .camera(camera.thinLens().at(0, 2.4, 5.5).lookAt(0, 0.6, -0.2).focal(u.mm(32)));
 ''')
P('L-02','sunny-16','Sunny 16','Light','A camera with real settings under a real sun: f/16, 1/125 s, ISO 100 is EV 15, and the scene is exposed correctly.',
 ['What is the EV100 of this camera? Check it against the title block','Set the shutter to 1/30 s — by how many stops does the image brighten?','Turn on False colour and read the exposure'], ['sensor','exposure'],
 '''
 # Sunny 16

 The old rule: in bright sun, at **f/16**, set the shutter to **1/ISO**. Here the camera has no automatic exposure — it is set like a real one, and the exposure follows from the settings:

 $$EV_{100} = \\log_2\\frac{N^2}{t} - \\log_2\\frac{S}{100} = \\log_2(16^2 \\cdot 125) = 14.97$$

 The sun is a real one too: 100 000 lx at normal incidence, with a physical sky. A camera saturates at $L_{max} = 1.2 \\cdot 2^{EV} \\approx 38\\,400$ nit, and the display maps $L/L_{max}$ through the tone map.

 > **Try it.** Turn on **False colour** in the viewport: the grey card sits near middle grey, the white card a couple of stops over, the sky's brightest part near clipping. Then move the **Shutter** param: every halving of the time is one stop more light.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({
   shutter: param.float(1 / 125).range(1 / 2000, 1 / 15).scale('log').label('Shutter (s)').static(),
   fstop: param.float(16).range(1.4, 22).scale('log').label('f-number').static(),
 });

 export default scene().params(P)
   .add(shape.box(0.4, 0.6, 0.04).at(-0.5, 0.3, 0).rotateY(u.deg(15)).material(material.pbr().baseColor(0.18)).id('grey-card'))
   .add(shape.box(0.4, 0.6, 0.04).at(0.1, 0.3, 0).rotateY(u.deg(-10)).material(material.pbr().baseColor(0.85).unchecked()).id('white-card'))
   .add(shape.sphere(0.25).at(0.7, 0.25, 0.2).material(material.metal('Al', { roughness: 0.1 })))
   .add(shape.plane(60).material(material.pbr().baseColor('#7a6a55').roughness(0.95)))
   .light(light.sun().elevation(u.deg(50)).azimuth(u.deg(35)).illuminance(u.lux(100_000)))
   .light(light.sky.physical({ turbidity: 2.5 }).fromSun())
   .camera(camera.thinLens().at(0, 1.0, 3.0).lookAt(0, 0.3, 0).focal(u.mm(50))
     .fstop(P.fstop.value).shutter(P.shutter.value).iso(100));
 ''')
P('L-03','sun-and-sky','The sun and the sky','Light','Move the sun from noon to the horizon: air mass dims and reddens it, the Preetham sky follows.',
 ['Sweep the sun from 90° to 5° and describe the illuminance','What does turbidity do to the sky colour?','Explain the Kasten–Young air mass'], ['units','sensor'],
 '''
 # The sun and the sky

 The sun's illuminance is not set here: it comes from the **air mass** the light crosses. Kasten and Young's formula gives the air mass at zenith angle $z$; Meinel's attenuation turns it into illuminance:

 $$AM = \\frac{1}{\\cos z + 0.50572\\,(96.07995 - z)^{-1.6364}} \\qquad E_\\perp \\approx 128\\,000 \\cdot 0.7^{AM^{0.678}}\\ \\mathrm{lx}$$

 — about 89.6 klx at zenith, 72.4 at 30°, 52.9 at 15°, 22.6 at 5°. The sun's colour follows the same path through the air: a blackbody at 5778 K, with blue scattered out more strongly as $AM$ grows. The sky is the **Preetham** analytic model, driven by the same sun direction and by **turbidity** (2 is crisp mountain air, 6 is a hazy summer day).

 > **Try it.** Drag **Sun elevation** down to 5° and watch the exposure meter follow (EV in the title block). Then raise **Turbidity**.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({
   elevation: param.angle(u.deg(45)).range(u.deg(1), u.deg(90)).label('Sun elevation'),
   azimuth: param.angle(u.deg(60)).range(u.deg(0), u.deg(360)).label('Sun azimuth'),
   turbidity: param.float(3).range(1.8, 9).label('Turbidity').static(),
 });

 const stone = material.pbr().baseColor('#bfb3a0').roughness(0.8);
 const obelisk = shape.box(0.5, 3, 0.5).at(0, 1.5, 0).material(stone);

 export default scene().params(P)
   .add(obelisk)
   .add(shape.sphere(0.6).at(1.8, 0.6, 0.8).material(material.pbr().baseColor(0.8).roughness(0.3)))
   .add(shape.plane().material(material.pbr().baseColor('#a89a80').roughness(0.95)))
   .light(light.sun().elevation(P.elevation).azimuth(P.azimuth))
   .light(light.sky.physical({ turbidity: P.turbidity.value }).fromSun())
   .camera(camera.thinLens().at(4.5, 1.6, 6.5).lookAt(0.4, 1.4, 0).focal(u.mm(28)));
 ''', focus='params')
P('L-04','golden-hour','Golden hour','Light','Six degrees above the horizon: long shadows, a warm sun, a blue fill from the sky.',
 ['Make it the blue hour instead','Measure the colour temperature difference between sun and shadow','Add a warm practical lamp in the window'], ['sensor'],
 '''
 # Golden hour

 At 6° elevation the sunlight crosses about nine atmospheres' worth of air. Blue is scattered away, so the direct light is warm — and that scattered blue becomes the **sky**, which now lights the shadows. The contrast you see is between two colour temperatures, roughly 3500 K in the sun and 10 000 K in the shade.

 The long shadows come from geometry alone: a pillar of height $h$ casts a shadow $h/\\tan(6°) \\approx 9.5h$ long.

 > **Try it.** Ask the agent to "make it the blue hour" — the sun just below the horizon, the sky alone. Notice how much the exposure has to open up (EV drops by 5–6 stops).
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const plaster = material.pbr().baseColor('#d8c8b0').roughness(0.85);
 const columns = scene.group(g => {
   for (let i = 0; i < 6; i++) g.add(shape.cylinder(0.18, 2.4).at(-3 + i * 1.2, 1.2, -1).material(plaster));
 });

 export default scene()
   .add(columns)
   .add(shape.box(7.6, 0.25, 1.2).at(0, 2.52, -1).material(plaster))
   .add(shape.sphere(0.4).at(0.6, 0.4, 1.4).material(material.pbr().baseColor('#5d7d9a').roughness(0.35)))
   .add(shape.plane().material(material.pbr().baseColor('#c2b49c').roughness(0.9)))
   .light(light.sun().elevation(u.deg(6)).azimuth(u.deg(70)))
   .light(light.sky.physical({ turbidity: 4 }).fromSun())
   .camera(camera.thinLens().at(1.5, 1.4, 7).lookAt(0, 1.0, 0).focal(u.mm(35)));
 ''')
P('L-05','temperature','Colour temperature','Light','Seven bulbs from candle to overcast sky: Planck’s law, normalised to the same luminous flux.',
 ['Which bulb is closest to D65 white?','Render this spectrally and compare','Explain why 1800 K looks orange and 12000 K blue'], ['units'],
 '''
 # Colour temperature

 Each bulb emits 600 lm with a **blackbody** spectrum at its temperature — Planck's law, integrated against the CIE colour-matching functions to get its chromaticity, then normalised so every bulb has the same luminance. Only the colour differs:

 $$B(\\lambda, T) = \\frac{2hc^2}{\\lambda^5}\\,\\frac{1}{e^{hc/\\lambda k T} - 1}$$

 | T | source |
 | --- | --- |
 | 1800 K | candle, sodium-ish |
 | 2700 K | incandescent bulb |
 | 3500 K | halogen, warm LED |
 | 5000 K | horizon daylight |
 | 6500 K | overcast daylight (≈ D65 white) |
 | 9000 K, 12000 K | blue sky in shade |

 The white balance of the display is D65, so 6500 K looks neutral.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const temps = [1800, 2700, 3500, 5000, 6500, 9000, 12000];
 const white = material.pbr().baseColor(0.8).roughness(0.5);
 const bulbs = scene.group(g => temps.forEach((T, i) => {
   const x = (i - 3) * 0.9;
   g.add(light.point().at(x, 1.1, 0).power(u.lm(600)).temperature(u.K(T)).radius(0.04));
   g.add(shape.sphere(0.22).at(x, 0.22, 0.1).material(white));
   g.add(shape.box(0.02, 1.6, 1.2).at(x + 0.45, 0.8, -0.2).material(white));   // a divider between booths
 }));

 export default scene()
   .add(bulbs)
   .add(shape.box(0.02, 1.6, 1.2).at(-3.15, 0.8, -0.2).material(white))
   .add(shape.plane(30).material(white))
   .add(shape.rect(10, 3).at(0, 1.5, -0.8).rotateX(u.deg(90)).material(white))
   .camera(camera.thinLens().at(0, 1.2, 5.2).lookAt(0, 0.6, 0).focal(u.mm(30)));
 ''')
P('L-06','soft-shadows','Size makes softness','Light','Three area lights with the same power and three sizes: the penumbra is the light’s size seen from the shadow.',
 ['Make the small light smaller still and watch the noise and the shadow','Why does the big panel give less contrast?'], ['monte-carlo'],
 '''
 # Size makes softness

 A shadow's soft edge — the **penumbra** — is where part of the light is hidden. Its width grows with the light's angular size seen from the floor: a source of size $s$ at height $d$ above an occluder of height $h$ gives a penumbra of about $s\\,h/(d - h)$.

 All three panels emit 1500 lm. The small one has a high luminance ($L = \\Phi/\\pi A$) and gives crisp shadows and bright highlights; the large one is dim to look at and wraps light around the objects.

 Sampling matters here: each panel is sampled directly (next-event estimation) and by the BSDF, and multiple importance sampling weights the two. Turn **Denoise** off to see the raw noise: small lights are easy for light sampling, large ones for BSDF sampling.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const sizes = [0.15, 0.6, 1.6];
 const bay = (s, x) => scene.group([
   shape.rect(s, s).at(x, 2.4, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(1500)).temperature(u.K(4500))),
   shape.cylinder(0.12, 0.9).at(x, 0.45, 0).material(material.pbr().baseColor(0.75)),
 ]);

 export default scene()
   .add(sizes.map((s, i) => bay(s, (i - 1) * 2.4)))
   .add(shape.plane(30).material(material.pbr().baseColor(0.55).roughness(0.9)))
   .add(shape.rect(9, 3.5).at(0, 1.75, -1.6).rotateX(u.deg(90)).material(material.pbr().baseColor(0.4)))
   .camera(camera.thinLens().at(0, 2.2, 5.6).lookAt(0, 0.4, 0).focal(u.mm(30)));
 ''')
P('L-07','spotlights','Spotlights on a stage','Light','Cones and soft edges: three coloured spots overlapping on a stage add up as light does.',
 ['Change the red spot to 5000 K white and compare','Make the cones wider with the same lumens — what happens to the brightness?'], ['units'],
 '''
 # Spotlights on a stage

 Three spots, 2000 lm each, red, green and blue. Where they overlap they **add** — light is linear — and the triple overlap is near white. The cone sets the angle; `.softEdge()` makes the falloff a smoothstep between the inner and outer cosines.

 The exposure is fixed at EV 7.5 — a dark stage would fool an averaging meter into blowing out the lit part. With `powerMode('cone')` (the default), all the flux goes into the cone: widening it from 15° to 30° spreads the same lumens over about four times the solid angle, so the intensity drops by four:

 $$I = \\frac{\\Phi}{2\\pi(1 - \\cos\\theta)}$$
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const spot = (c, x) => light.spot().at(x, 4, 2.5).aim(x * 0.15, 0, 0).power(u.lm(2000)).cone(u.deg(16)).softEdge(u.deg(3)).color(c);

 export default scene()
   .light(spot('#ff2020', -1.2), spot('#20ff30', 0), spot('#2040ff', 1.2))
   .add(shape.cylinder(3, 0.3).at(0, 0.15, 0).material(material.pbr().baseColor(0.7).roughness(0.6)))
   .add(shape.sphere(0.35).at(0, 0.65, 0).material(material.pbr().baseColor(0.85).roughness(0.25)))
   .add(shape.plane(40).material(material.pbr().baseColor(0.08).roughness(0.9)))
   .add(shape.rect(14, 6).at(0, 3, -3).rotateX(u.deg(90)).material(material.pbr().baseColor(0.1)))
   .camera(camera.thinLens().at(0, 2.2, 6.5).lookAt(0, 0.5, 0).focal(u.mm(35)).exposure(7.5));
 ''')
P('L-08','inverse-square','The inverse-square law','Light','Five cards at 1, 2, 3, 4 and 5 m, each facing a bare bulb: illuminance falls as 1/d², and the meter proves it.',
 ['Meter each card and check the ratios','Replace the bulb with a long panel — does 1/d² still hold up close?'], ['units'],
 '''
 # The inverse-square law

 A point source of intensity $I$ lights a surface facing it, at distance $d$, with illuminance

 $$E = \\frac{I}{d^2}$$

 The bulb is 1500 lm, so $I = 1500/4\\pi \\approx 119$ cd: 119 lx at 1 m, 30 at 2 m, 13 at 3 m, 7.5 at 4 m, 4.8 at 5 m. Each card is turned to face the bulb (`.facing(…)`), so the light arrives at normal incidence.

 > **Try it.** **Alt-click** each card: a matte white of albedo 0.8 has luminance $L = \\rho E/\\pi$ — about 30, 7.6, 3.4, 1.9 and 1.2 nit. The exposure is fixed (`.exposure(6)`), so the falloff is not hidden by the meter.

 An extended source breaks the law up close: within a few times its own size, a panel behaves more like a plane than a point.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const white = material.pbr().baseColor(0.8).roughness(0.9);
 const bulb = [0, 0.6, 0];
 const cards = scene.group(g => {
   for (let d = 1; d <= 5; d++) {
     const a = (d - 3) * 0.4;                                   // fan them out so none shadows another
     g.add(shape.rect(0.5, 0.5).at(d * Math.cos(a), 0.6, d * Math.sin(a)).facing(...bulb).material(white).id('card-' + d));
   }
 });

 export default scene()
   .add(cards)
   .light(light.point().at(...bulb).power(u.lm(1500)).temperature(u.K(5000)).radius(0.03))
   .add(shape.plane(40).material(material.pbr().baseColor(0.1).roughness(0.95)))
   .camera(camera.thinLens().at(-1.6, 1.6, 0.3).lookAt(2.4, 0.4, 0.6).focal(u.mm(22)).exposure(6));
 ''')
P('L-09','three-point','Three-point lighting','Light','Key, fill and rim on a bust: the classic portrait setup, with the lighting ratio as a param.',
 ['Set a 4:1 key-to-fill ratio','Make it Rembrandt lighting','Take a screenshot and critique the lighting like a cinematographer'], ['units','sensor'],
 '''
 # Three-point lighting

 - **Key** — the main light, 45° to the side and above.
 - **Fill** — softer, on the other side, to lift the shadows. The **lighting ratio** is (key + fill) : fill on the two cheeks; 2:1 is flat, 4:1 is dramatic, 8:1 is film noir.
 - **Rim** — behind and above, to separate the subject from the background with a bright edge.

 Because light transport is **linear** in emission, the ratio is set by the fill's power alone: halving the fill raises the ratio. The params do exactly that.

 > **Try it.** Ask the agent: "measure the lighting ratio on the face and set it to 4:1". It can meter both cheeks with `render.meter(x, y)`.
 ''',
 '''
 import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

 const P = params({
   key: param.lumen(2400).range(200, 6000).label('Key'),
   fill: param.lumen(800).range(0, 3000).label('Fill'),
   rim: param.lumen(1600).range(0, 5000).label('Rim'),
 });
 const skin = material.pbr().baseColor('#d9b49a').roughness(0.55).sheen(0.3);

 export default scene().params(P)
   .add(shape.sphere(0.22).at(0, 1.62, 0).scale(0.9, 1.15, 0.95).material(skin).id('head'))
   .add(shape.capsule(0.18, 0.5).at(0, 1.05, 0).scale(1.6, 1, 0.9).material(material.pbr().baseColor(0.12).roughness(0.6)))
   .add(shape.cylinder(0.08, 0.2).at(0, 1.36, 0).material(skin))
   .add(shape.rect(1.0, 1.0).at(-1.6, 2.2, 1.4).facing(0, 1.6, 0).emit(light.area().power(P.key).temperature(u.K(5200))).id('key'))
   .add(shape.rect(1.6, 1.6).at(1.9, 1.7, 1.6).facing(0, 1.6, 0).emit(light.area().power(P.fill).temperature(u.K(5600))).id('fill'))
   .add(shape.rect(0.5, 0.5).at(0.6, 2.6, -1.4).facing(0, 1.7, 0).emit(light.area().power(P.rim).temperature(u.K(4800))).id('rim'))
   .add(shape.rect(8, 5).at(0, 2.5, -2.5).rotateX(u.deg(90)).material(material.pbr().baseColor(0.06)))
   .add(shape.plane(20).material(material.pbr().baseColor(0.1)))
   .camera(camera.thinLens().at(0.5, 1.6, 3.2).lookAt(0, 1.45, 0).focal(u.mm(85)).fstop(2.8).focusOn('#head'));
 ''', focus='params')
P('L-10','studio','A product in the studio','Light','A procedural studio: a dark sweep with two softboxes and a top light, reflected in glass and chrome.',
 ['Rotate the studio environment to move the highlights','Swap the chrome for gold'], ['renderer'],
 '''
 # A product in the studio

 `light.env.studio()` is a procedural environment: a dark gradient dome with a key softbox, a fill and a top strip. Shiny products are mostly **reflections** — what you see on the chrome cap and in the glass is the studio itself, so moving the softboxes (`rotate`) moves every highlight.

 The bottle is smooth glass (IOR 1.5, exact Fresnel, refraction), the liquid inside is an absorbing medium (Beer–Lambert: amber after 20 cm), the cap is chromium with its measured complex IOR.
 ''',
 '''
 import { scene, shape, material, light, camera, ior, medium, units as u } from 'candela';

 const glass = material.glass({ ior: 1.5 });
 const perfume = material.glass({ ior: 1.36, absorb: '#e8b45c', distance: u.cm(20) });

 export default scene()
   .add(shape.roundedBox(0.5, 0.7, 0.22, 0.04).at(0, 0.35, 0).material(glass))
   .add(shape.roundedBox(0.44, 0.5, 0.16, 0.03).at(0, 0.3, 0).material(perfume))
   .add(shape.cylinder(0.09, 0.22).at(0, 0.81, 0).material(material.metal('Cr', { roughness: 0.06 })))
   .add(shape.cylinder(1.4, 0.04).at(0, -0.02, 0).material(material.pbr().baseColor(0.04).roughness(0.15)))
   .light(light.env.studio({ intensity: u.nit(1200), rotate: u.deg(20) }))
   .camera(camera.thinLens().at(0.3, 0.55, 2.4).lookAt(0, 0.4, 0).focal(u.mm(70)).fstop(5.6));
 ''')
P('L-11','night','Night street','Light','Sodium-orange lamps in fog under a starry sky: an exposure seven stops below daylight.',
 ['Change the lamps to 4000 K LEDs','Thicken the fog until the lamps glow','What EV is this scene at?'], ['media','exposure'],
 '''
 # Night street

 Street lamps (1800 K, close to low-pressure sodium's colour) in a light **fog**: the light scatters off the air on its way to the ground and to the camera, so every lamp carries a halo and its beam is visible. The fog is a homogeneous medium with a mean free path of 120 m and a forward-scattering phase function (g = 0.7).

 The scene's metered exposure is around **EV 0–2** — a thousand times less light than a sunny day. The meter finds it; the tone map does the rest.
 ''',
 '''
 import { scene, shape, material, light, camera, medium, phase, units as u } from 'candela';

 const lamp = (z) => scene.group([
   shape.cylinder(0.05, 4).at(1.8, 2, z).material(material.pbr().baseColor(0.1).metallic(1).roughness(0.4)),
   light.point().at(1.5, 3.9, z).power(u.lm(4000)).temperature(u.K(1900)).radius(0.08),
 ]);

 export default scene()
   .add([0, -8, -16, -24].map(lamp))
   .add(shape.plane().material(material.pbr().baseColor(0.06).roughness(0.35)))
   .add(shape.box(1, 0.15, 60).at(-2.6, 0.075, -15).material(material.pbr().baseColor(0.3)))
   .add(shape.box(0.8, 1.2, 1.6).at(-1.0, 0.6, -5).material(material.carPaint('#30405a')))
   .light(light.env.night())
   .medium(medium.homogeneous({ albedo: 0.9, meanFreePath: u.m(120), phase: phase.hg(0.7) }))
   .camera(camera.thinLens().at(0, 1.5, 6).lookAt(0.2, 1.6, -10).focal(u.mm(35)));
 ''')
P('L-12','neon','Neon: emission and MIS','Light','Glowing tubes as emissive materials versus registered area lights: the same light, two very different estimators.',
 ['Turn the emissive panel into a registered light and compare the noise','Explain multiple importance sampling with this scene'], ['monte-carlo','renderer'],
 '''
 # Neon: emission and MIS

 The neon tubes are **emissive materials** — surfaces that radiate a luminance (`.emission('#ff3366', u.nit(800))`). A path only gets their light when a BSDF-sampled ray happens to hit one: on the glossy floor that works, on the diffuse wall it is slow and noisy.

 The panel on the right is an **area light** (`.emit(light.area()…)`): it is also *sampled directly* from every shading point, and the two strategies are weighted by the **power heuristic** so their sum is still one unbiased estimate:

 $$w_{light} = \\frac{p_{light}^2}{p_{light}^2 + p_{bsdf}^2}$$

 Turn **Denoise** off and compare the wall near each.
 ''',
 '''
 import { scene, shape, material, light, camera, units as u } from 'candela';

 const neon = (c, L) => material.emissive(c, u.nit(L));

 export default scene()
   .add(shape.capsule(0.03, 1.4).at(-1.2, 1.4, -0.9).rotateZ(u.deg(90)).material(neon('#ff3070', 900)))
   .add(shape.capsule(0.03, 0.9).at(-1.6, 0.8, -0.9).material(neon('#30c0ff', 900)))
   .add(shape.torus(0.35, 0.03).at(-0.6, 0.75, -0.9).rotateX(u.deg(90)).material(neon('#ffe040', 900)))
   .add(shape.rect(0.4, 1.2).at(1.4, 1.0, -0.9).rotateX(u.deg(90)).emit(light.area().power(u.lm(1600)).color('#a0ffb0')))
   .add(shape.rect(8, 4).at(0, 2, -1).rotateX(u.deg(90)).material(material.pbr().baseColor(0.35).roughness(0.9)))
   .add(shape.plane(20).material(material.pbr().baseColor(0.05).roughness(0.12)))
   .add(shape.sphere(0.3).at(0.4, 0.3, 0.4).material(material.pbr().baseColor(0.7).roughness(0.3)))
   .camera(camera.thinLens().at(0, 1.2, 3.8).lookAt(0, 0.8, -0.5).focal(u.mm(32)));
 ''')
