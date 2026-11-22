import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({
  paint: param.color('#b01818').label('Paint'),
  gloss: param.float(0.65).range(0, 1).step(0.01).label('Gloss'),
  metal: param.float(0).range(0, 1).label('Metallic'),
  coat:  param.bool(true).static().label('Clear coat'),
  sun:   param.angle(u.deg(35)).range(u.deg(2), u.deg(90)).label('Sun elevation'),
});

export default scene().params(P)
  .add(shape.sphere(0.8).at(-1, 0.8, 0).material(material.pbr().baseColor(P.paint).roughness(P.gloss.map(g => 1 - g)).metallic(P.metal).coat(P.coat.select(1, 0))))
  .add(shape.roundedBox(1.2, 1.2, 1.2, 0.12).at(1.1, 0.6, 0).rotateY(u.deg(25)).material(material.pbr().baseColor(P.paint).roughness(P.gloss.map(g => 1 - g)).metallic(P.metal)))
  .add(shape.plane(40).material(material.pbr().baseColor(0.3).roughness(0.9)))
  .light(light.sun().elevation(P.sun).azimuth(u.deg(130)))
  .light(light.sky.physical({ turbidity: 2.5 }).fromSun())
  .camera(camera.thinLens().at(0, 1.8, 6.5).lookAt(0, 0.6, 0).focal(u.mm(45)));
