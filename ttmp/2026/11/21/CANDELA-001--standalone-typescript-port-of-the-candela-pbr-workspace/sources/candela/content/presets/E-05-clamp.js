import { scene, shape, material, light, camera, engine as E, integrator, param, params, units as u } from 'candela';

const P = params({ clamp: param.float(0).range(0, 20).label('Clamp (0 = off)').static() });

export default scene().params(P)
  .add(shape.sphere(0.35).at(0, 0.35, 0).material(material.glass({ ior: 1.5 })))
  .add(shape.cube(0.4).at(-0.9, 0.2, -0.4).rotateY(u.deg(25)).material(material.pbr().baseColor('#c06030')))
  .add(shape.plane(30).material(material.pbr().baseColor(0.7).roughness(0.9)))
  .add(shape.sphere(0.05).at(0.8, 1.6, -0.6).emit(light.area().power(u.lm(4000)).temperature(u.K(4000))))
  .light(light.env.uniform(u.nit(15)))
  .camera(camera.thinLens().at(0, 1.4, 2.6).lookAt(0, 0.2, 0).focal(u.mm(40)));

export const engine = E.offline().integrator(integrator.path({ clamp: P.clamp.value || undefined }));
