import { scene, shape, material, light, camera, engine as E, pass, param, params, units as u } from 'candela';

const P = params({ tm: param.choice(['agx', 'aces', 'neutral', 'filmic', 'reinhard', 'linear'], 'agx').label('Tone map') });
const neon = c => material.emissive(c, u.nit(3000));

export default scene().params(P)
  .add(shape.capsule(0.05, 1.2).at(-0.9, 1.0, -0.6).material(neon('#2040ff')))
  .add(shape.capsule(0.05, 1.2).at(0, 1.0, -0.6).material(neon('#ff2010')))
  .add(shape.capsule(0.05, 1.2).at(0.9, 1.0, -0.6).material(neon('#20ff40')))
  .add(shape.sphere(0.35).at(0, 0.35, 0.2).material(material.pbr().baseColor(0.7).roughness(0.3)))
  .add(shape.rect(5, 3).at(0, 1.5, -0.8).rotateX(u.deg(90)).material(material.pbr().baseColor(0.5).roughness(0.8)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.4)))
  .camera(camera.thinLens().at(0, 1.0, 3).lookAt(0, 0.8, 0).focal(u.mm(35)));

export const engine = E.realtime().post(pass.tonemap(P.tm.value));
