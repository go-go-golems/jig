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
