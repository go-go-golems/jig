import { scene, shape, material, light, camera, mesh, hdri, params, param, units as u } from 'candela';

// A gear train on a plate. The gears are triangle meshes with CAD faces (face-0, face-1, flank, tip, root, bore);
// their materials come from part metadata through autoFinish(). The motion is not in the scene graph: it is
// `animation`, a function of time returning a pose per id — what an animation engine or a solver would send.
const P = params({
  rpm: param.float(60).range(0, 600).label('Input speed (rpm)'),
  shutter: param.float(180).range(0, 360).step(15).static().label('Shutter angle (°)'),
});

const m = 0.003;                       // module: 3 mm teeth
const width = 0.012;
const gearDef = (z, material) => mesh.gear({ teeth: z, module: m, width, bore: 0.004, name: `spur z${z}` }).withMeta({ material });

// meshing: B sits at angle β around A, its centre distance m·(zA + zB)/2; its starting angle puts a gap where A
// has a tooth, and it turns the other way at zA/zB of A's speed
const pitch = z => 2 * Math.PI / z;
const train = [{ id: 'input', z: 20, x: -0.04, z0: 0.0, phase: 0, ratio: 1, material: 'steel' }];
const add = (id, z, from, deg, material) => {
  const A = train.find(g => g.id === from), b = deg * Math.PI / 180, C = m * (A.z + z) / 2 + 2e-5;
  const s = ((((b + A.phase) / pitch(A.z)) % 1) + 1) % 1;
  train.push({ id, z, x: A.x + C * Math.cos(b), z0: A.z0 + C * Math.sin(b), phase: (0.5 - s) * pitch(z) - b - Math.PI, ratio: -A.ratio * A.z / z, material });
};
add('idler', 32, 'input', -25, 'steel');
add('output', 14, 'idler', 40, 'brass');

const shaft = mesh.shaft([[0.006, 0.0058], [0.022, 0.004]], { name: 'shaft' }).withMeta({ material: 'stainless' });
const nut = mesh.nut({ d: 0.008 });
const bolt = mesh.hexBolt({ d: 0.006, length: 0.016 });
const plate = mesh.box(0.24, 0.01, 0.16, { name: 'plate' }).withMeta({ material: 'aluminium', finish: 'anodized', color: '#22262c' });

// a gear, its shaft and its nut turn together: one group, one pose
const unit = g => scene.group([
  shape.mesh(gearDef(g.z, g.material)).autoFinish(),
  shape.mesh(shaft).autoFinish().at(0, -0.012, 0),
  shape.mesh(nut).autoFinish().at(0, width / 2 + 0.0035, 0),
]).id(g.id);

export const animation = t => {
  const w = P.rpm.value / 60 * 2 * Math.PI;
  return Object.fromEntries(train.map(g => [g.id, { position: [g.x, 0.016 + width / 2, g.z0], rotation: [0, g.phase + g.ratio * w * t, 0] }]));
};

export default scene()
  .add(shape.mesh(plate).autoFinish().at(0, 0.005, 0))
  .add(...train.map(unit))
  .add(...[[-0.105, -0.065], [0.105, -0.065], [-0.105, 0.065], [0.105, 0.065]].map(([x, z], k) => shape.mesh(bolt).autoFinish().at(x, 0.01, z).rotateY(k * 0.7)))
  .add(shape.plane(4).material(material.pbr().baseColor(0.06).roughness(0.7)))
  .light(light.env.hdri(hdri.studio(), { luminance: u.nit(420) }))
  .camera(camera.thinLens().at(0.11, 0.2, 0.26).lookAt(0.0, 0.012, -0.005).focal(u.mm(55)).fstop(11)
    .motionBlur({ angle: u.deg(P.shutter.value), fps: 24, steps: 8 }));
