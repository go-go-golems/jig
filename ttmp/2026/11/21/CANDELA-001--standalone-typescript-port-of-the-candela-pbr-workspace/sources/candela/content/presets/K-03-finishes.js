import { scene, shape, material, light, camera, mesh, hdri, finish, params, param, units as u } from 'candela';

// Sixteen pucks, one finish each. A puck is a revolved part: a faced top, a turned side, a chamfer between
// them. Machined metals get their grooves from a tangent field (anisotropic highlights); coatings sit over them.
const P = params({
  light: param.angle(u.deg(0)).range(u.deg(-180), u.deg(180)).label('Light around the chart'),
});
const puck = mesh.revolve([[0, 0], [0.02, 0], [0.02, 0.012], [0.0185, 0.0135], [0, 0.0135]], { name: 'puck', segments: 128, faces: ['bottom', 'side', 'chamfer', 'top'] });

const chart = [
  ['turned steel', { top: finish.faced(), side: finish.turned(), chamfer: finish.turned() }],
  ['ground steel', { top: finish.ground({ direction: [1, 0, 0] }), side: finish.ground() }],
  ['milled aluminium', { top: finish.milled({ metal: 'aluminium', direction: [1, 0, 0] }), side: finish.turned({ metal: 'aluminium' }) }],
  ['brushed stainless', { top: finish.brushed({ metal: 'stainless', direction: [1, 0, 0] }), side: finish.brushed({ metal: 'stainless', direction: [0, 1, 0] }) }],
  ['polished chrome', { all: finish.polished('chrome') }],
  ['turned brass', { top: finish.faced('brass'), side: finish.turned('brass') }],
  ['turned copper', { top: finish.faced('copper'), side: finish.turned('copper') }],
  ['titanium', { top: finish.faced('titanium'), side: finish.turned('titanium') }],
  ['black oxide', { top: finish.blackOxide({ process: 'faced' }), side: finish.blackOxide() }],
  ['clear zinc', { top: finish.zinc({ process: 'faced' }), side: finish.zinc() }],
  ['yellow zinc', { top: finish.zinc({ process: 'faced', yellow: true }), side: finish.zinc({ yellow: true }) }],
  ['as-cast iron', { all: finish.asCast() }],
  ['anodized blue', { top: finish.anodized('#1d4f91', { process: 'faced' }), side: finish.anodized('#1d4f91', { process: 'turned' }) }],
  ['anodized red', { top: finish.anodized('#9e1b24', { process: 'faced' }), side: finish.anodized('#9e1b24', { process: 'turned' }) }],
  ['paint', { all: finish.paint('#d8a21b') }],
  ['rubber', { all: finish.rubber() }],
];

const pucks = chart.map(([name, f], k) => {
  let s = shape.mesh(puck).at(((k % 4) - 1.5) * 0.055, 0, (Math.floor(k / 4) - 1.5) * 0.055).id(name.replace(/\s+/g, '-'));
  if (f.all) s = s.material(f.all);
  else { s = s.material(f.side); for (const [face, m] of Object.entries(f)) s = s.face(face, m); }
  return s;
});

export default scene()
  .add(...pucks)
  .add(shape.box(0.25, 0.006, 0.25).at(0, -0.003, 0).material(material.pbr().baseColor(0.18).roughness(0.75)))
  .add(shape.plane(4).at(0, -0.006, 0).material(material.pbr().baseColor(0.05).roughness(0.8)))
  // one small, bright strip light makes the grooves read: its highlight stretches across them
  .add(scene.group([shape.rect(0.03, 0.5).at(0, 0.32, -0.22).facing(0, 0, 0).emit(light.area().luminance(u.nit(60000)).temperature(u.K(5600)))]).rotateY(P.light))
  .light(light.env.hdri(hdri.studio(), { luminance: u.nit(120) }))
  .camera(camera.thinLens().at(0, 0.3, 0.28).lookAt(0, 0, 0.005).focal(u.mm(50)).fstop(16));
