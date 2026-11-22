import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({
  key: param.lumen(2400).range(200, 6000).label('Key'),
  fill: param.lumen(800).range(0, 3000).label('Fill'),
  rim: param.lumen(1600).range(0, 5000).label('Rim'),
});
const skin = material.pbr().baseColor('#d9b49a').roughness(0.55).sheen(0.3);

export default scene().params(P)
  .add(shape.sphere(0.22).at(0, 1.62, 0).scale(0.9, 1.15, 0.95).material(skin).id('head'))
  .add(shape.capsule(0.18, 0.5).at(0, 1.05, 0).scale(1.6, 1, 0.9).material(material.pbr().baseColor(0.12).roughness(0.6)))
  .add(shape.cylinder(0.08, 0.2).at(0, 1.36, 0).material(skin))
  .add(shape.rect(1.0, 1.0).at(-1.6, 2.2, 1.4).facing(0, 1.6, 0).emit(light.area().power(P.key).temperature(u.K(5200))).id('key'))
  .add(shape.rect(1.6, 1.6).at(1.9, 1.7, 1.6).facing(0, 1.6, 0).emit(light.area().power(P.fill).temperature(u.K(5600))).id('fill'))
  .add(shape.rect(0.5, 0.5).at(0.6, 2.6, -1.4).facing(0, 1.7, 0).emit(light.area().power(P.rim).temperature(u.K(4800))).id('rim'))
  .add(shape.rect(8, 5).at(0, 2.5, -2.5).rotateX(u.deg(90)).material(material.pbr().baseColor(0.06)))
  .add(shape.plane(20).material(material.pbr().baseColor(0.1)))
  .camera(camera.thinLens().at(0.5, 1.6, 3.2).lookAt(0, 1.45, 0).focal(u.mm(85)).fstop(2.8).focusOn('#head'));
