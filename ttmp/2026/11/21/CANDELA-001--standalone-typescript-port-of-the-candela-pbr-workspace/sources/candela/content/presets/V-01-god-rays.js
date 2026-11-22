import { scene, shape, material, light, camera, medium, phase, param, params, units as u } from 'candela';

const P = params({ mfp: param.length(18).range(4, 80).label('Mean free path (m)').static() });
const wall = material.pbr().baseColor('#c8bca8').roughness(0.9);
const room = scene.group([
  shape.box(0.2, 3, 8).at(-3, 1.5, 0).material(wall),                       // right wall (solid)
  shape.box(8, 3, 0.2).at(0, 1.5, -4).material(wall),                       // back wall
  shape.box(8, 0.2, 8.4).at(0, 3.1, 0).material(wall),                      // ceiling
  // left wall with three windows
  shape.box(0.2, 1.0, 8).at(3, 0.5, 0).material(wall),
  shape.box(0.2, 0.8, 8).at(3, 2.6, 0).material(wall),
  ...[-3.5, -1.5, 0.5, 2.5, 4].map(z => shape.box(0.2, 1.2, z === 4 ? 0.8 : 1.2).at(3, 1.6, z === 4 ? 3.6 : z).material(wall)),
]);

export default scene().params(P)
  .add(room)
  .add(shape.plane().material(material.pbr().baseColor('#6a5a48').roughness(0.8)))
  .add(shape.sphere(0.4).at(-0.6, 0.4, -1).material(material.pbr().baseColor('#b3261e').roughness(0.4)))
  .light(light.sun().elevation(u.deg(28)).azimuth(u.deg(80)).illuminance(u.lux(60000)))
  .light(light.sky.physical({ turbidity: 3 }).fromSun().scale(0.2))
  .medium(medium.homogeneous({ albedo: 0.9, meanFreePath: u.m(P.mfp.value), phase: phase.hg(0.7) }))
  .camera(camera.thinLens().at(-2.2, 1.5, 3.6).lookAt(1.0, 1.1, -1.5).focal(u.mm(24)));
