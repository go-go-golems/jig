import { scene, shape, material, light, camera, engine as E, param, params, units as u } from 'candela';

const P = params({ which: param.choice(['preview', 'realtime', 'offline'], 'realtime').label('Engine') });

export default scene().params(P)
  .add(shape.sphere(0.4).at(-0.5, 0.4, 0).material(material.glass({ ior: 1.5 })))
  .add(shape.roundedBox(0.6, 0.6, 0.6, 0.06).at(0.5, 0.3, -0.2).rotateY(u.deg(25)).material(material.metal('Cu', { roughness: 0.3 })))
  .add(shape.plane(30).material(material.pbr().baseColor(0.6).roughness(0.8)))
  .add(shape.rect(0.6, 0.6).at(0, 2, 0.5).facing(0, 0, 0).emit(light.area().power(u.lm(3000))))
  .light(light.env.uniform(u.nit(20)))
  .camera(camera.thinLens().at(0, 1.1, 2.8).lookAt(0, 0.3, 0).focal(u.mm(40)));

export const engine = P.which.pick({ preview: E.preview(), realtime: E.realtime(), offline: E.offline() });
