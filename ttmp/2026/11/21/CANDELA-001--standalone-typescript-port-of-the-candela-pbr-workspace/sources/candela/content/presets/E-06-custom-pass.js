import { scene, shape, material, light, camera, engine as E, pass, fx, param, units as u } from 'candela';

const duotone = pass.define('duotone', {
  params: { levels: param.float(5).range(2, 12), dark: param.color('#1b2a4a'), light: param.color('#f2d8a8') },
  stage: 'display',
  kernel: ({ color }, P) => fx.mix(P.dark, P.light, color.luminance().mul(P.levels).floor().div(P.levels.sub(1)).clamp(0, 1)),
});

export default scene()
  .add(shape.sphere(0.5).at(-0.6, 0.5, 0).material(material.pbr().baseColor(0.8).roughness(0.3)))
  .add(shape.torus(0.35, 0.13).at(0.6, 0.45, 0.2).rotateX(u.deg(60)).material(material.pbr().baseColor(0.6)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.5)))
  .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(70) }))
  .camera(camera.thinLens().at(0, 1.2, 3.2).lookAt(0, 0.45, 0).focal(u.mm(40)));

export const engine = E.realtime().post(pass.tonemap('agx'), duotone());
