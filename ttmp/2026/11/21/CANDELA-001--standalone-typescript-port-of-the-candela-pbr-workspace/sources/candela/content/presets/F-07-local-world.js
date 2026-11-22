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
