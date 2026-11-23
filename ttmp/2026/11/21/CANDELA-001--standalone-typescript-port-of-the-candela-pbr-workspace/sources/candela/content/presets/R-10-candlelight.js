import { scene, shape, material, light, camera, units as u } from 'candela';

const wax = material.subsurface({ albedo: [0.97, 0.92, 0.82], meanFreePath: u.mm(5), roughness: 0.6 });
const flame = material.emissive('#ffb050', u.nit(12000));
const candle = (x, z, h) => scene.group([
  shape.cylinder(0.025, h).at(x, 0.8 + h / 2, z).material(wax),
  shape.capsule(0.006, 0.018).at(x, 0.8 + h + 0.018, z).material(flame),
  light.point().at(x, 0.8 + h + 0.02, z).power(u.lm(12)).temperature(u.K(1850)),
]);
const glass = material.glass({ ior: 1.5 });

export default scene()
  .add(candle(-0.12, -0.05, 0.22), candle(0.0, -0.12, 0.28), candle(0.1, -0.02, 0.18))
  .add(shape.box(1.6, 0.04, 1.0).at(0, 0.78, 0).material(material.pbr().baseColor('#e8e0d0').roughness(0.9).unchecked('W330')))
  .add(shape.cylinder(0.12, 0.01).at(-0.35, 0.805, 0.2).material(material.ceramic()), shape.cylinder(0.12, 0.01).at(0.38, 0.805, 0.22).material(material.ceramic()))
  .add(shape.cylinder(0.035, 0.12).at(-0.2, 0.86, 0.15).material(glass), shape.cylinder(0.035, 0.12).at(0.22, 0.86, 0.12).material(glass))
  .add(shape.rect(6, 3).at(0, 1.5, -1.2).rotateX(u.deg(90)).material(material.pbr().baseColor('#4a3a30').roughness(0.9)))
  .add(shape.plane(30).material(material.pbr().baseColor('#3a2a20').roughness(0.7)))
  .camera(camera.thinLens().at(0.1, 1.08, 0.95).lookAt(0, 0.9, -0.05).focal(u.mm(45)).fstop(2.8));
