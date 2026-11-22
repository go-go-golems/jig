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
