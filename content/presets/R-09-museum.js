import { scene, shape, material, light, camera, units as u } from 'candela';

const marble = material.subsurface({ albedo: [0.96, 0.95, 0.92], meanFreePath: u.mm(8), roughness: 0.55 });
const bust = scene.group([
  shape.sphere(0.11).scale(0.85, 1.1, 0.95).at(0, 0.36, 0),
  shape.capsule(0.018, 0.04).at(0, 0.35, 0.095).rotateX(u.deg(-20)),
  shape.cylinder(0.05, 0.12).at(0, 0.22, 0),
  shape.roundedBox(0.36, 0.14, 0.18, 0.06).at(0, 0.12, 0),
].map(s => s.material(marble)));

export default scene()
  .add(shape.box(0.4, 1.0, 0.4).at(0, 0.5, 0).material(material.pbr().baseColor('#36322e').roughness(0.6)))
  .add(bust.at(0, 1.0, 0).id('bust'))
  .add(shape.rect(8, 4).at(0, 2, -1.2).rotateX(u.deg(90)).material(material.pbr().baseColor('#3a2a26').roughness(0.9)))
  .add(shape.plane(30).material(material.pbr().baseColor('#4a4038').roughness(0.4)))
  .light(light.spot().at(0.6, 3, 1.4).aim(0, 1.3, 0).power(u.lm(2500)).cone(u.deg(25)).softEdge(u.deg(6)).temperature(u.K(3000)))
  .light(light.env.uniform(u.nit(0.6)))
  .camera(camera.thinLens().at(0.5, 1.45, 1.6).lookAt(0, 1.3, 0).focal(u.mm(70)).fstop(4).focusOn('#bust'));
