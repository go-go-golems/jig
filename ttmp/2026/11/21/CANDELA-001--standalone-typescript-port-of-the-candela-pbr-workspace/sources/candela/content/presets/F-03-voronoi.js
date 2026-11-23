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
