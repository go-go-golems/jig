import { scene, shape, material, light, camera, mesh, hdri, finish, params, param, units as u } from 'candela';

// A tray of fasteners: three definitions (a bolt, a nut, a washer), hundreds of instances. Each definition's
// triangles and BVH are stored once; the scene's BVH holds instances, each a transform and a pointer.
const P = params({ count: param.int(240).range(20, 1200).step(20).static().label('Fasteners') });

const bolt = mesh.hexBolt({ d: 0.008, length: 0.03 });
const nut = mesh.nut({ d: 0.008 });
const washer = mesh.washer({ d: 0.008 });
const brassNut = nut.withMeta({ material: 'brass', finish: null, process: 'turned' });

// a deterministic scatter (a seeded LCG), so the tray is the same on every build
let seed = 7; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const W = 0.34, D = 0.24, parts = [];
for (let k = 0; k < P.count.value; k++) {
  const x = (rnd() - 0.5) * (W - 0.03), z = (rnd() - 0.5) * (D - 0.03), a = rnd() * Math.PI * 2, r = rnd();
  if (r < 0.3) parts.push(shape.mesh(bolt).autoFinish().rotateZ(Math.PI / 2 + (rnd() - 0.5) * 0.2).rotateY(a).at(x, 0.0068 + rnd() * 0.004, z));
  else if (r < 0.62) parts.push(shape.mesh(rnd() < 0.2 ? brassNut : nut).autoFinish().rotateX((rnd() - 0.5) * 0.25).rotateY(a).at(x, 0.0034 + rnd() * 0.006, z));
  else parts.push(shape.mesh(washer).autoFinish().rotateX((rnd() - 0.5) * 0.3).rotateY(a).at(x, 0.0009 + rnd() * 0.007, z));
}
const tray = mesh.merge([
  { mesh: mesh.box(W + 0.02, 0.004, D + 0.02, { name: 'floor' }), at: [0, -0.002, 0], prefix: 'floor-' },
  { mesh: mesh.box(W + 0.02, 0.03, 0.006), at: [0, 0.015, D / 2 + 0.013], prefix: 'wall-n-' },
  { mesh: mesh.box(W + 0.02, 0.03, 0.006), at: [0, 0.015, -D / 2 - 0.013], prefix: 'wall-s-' },
  { mesh: mesh.box(0.006, 0.03, D + 0.032), at: [W / 2 + 0.013, 0.015, 0], prefix: 'wall-e-' },
  { mesh: mesh.box(0.006, 0.03, D + 0.032), at: [-W / 2 - 0.013, 0.015, 0], prefix: 'wall-w-' },
], { name: 'tray' });

export default scene()
  .add(...parts)
  .add(shape.mesh(tray).material(finish.powderCoat('#3d5a7a')))
  .add(shape.plane(6).at(0, -0.004, 0).material(material.pbr().baseColor(0.45).roughness(0.85)))
  .light(light.env.hdri(hdri.studio(), { luminance: u.nit(400) }))
  .camera(camera.thinLens().at(0.0, 0.42, 0.3).lookAt(0, 0, 0.01).focal(u.mm(40)).fstop(11));
