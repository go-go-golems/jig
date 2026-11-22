import { scene, shape, material, ior, light, camera, fx, units as u } from 'candela';

const n = [1.333, 1.5, 1.77, 2.42];
const board = material.pbr().roughness(0.6).baseColor(p => fx.mix(fx.color(0.08), fx.color(0.8), fx.checker(p.P.xz, 3)));

export default scene()
  .add(n.map((k, i) => shape.sphere(0.4).at((i - 1.5) * 1.0, 0.42, 0).material(material.glass({ ior: k }))))
  .add(shape.plane(40).material(board))
  .light(light.env.studio({ intensity: u.nit(800) }))
  .camera(camera.thinLens().at(0, 1.8, 3.6).lookAt(0, 0.3, 0).focal(u.mm(40)));
