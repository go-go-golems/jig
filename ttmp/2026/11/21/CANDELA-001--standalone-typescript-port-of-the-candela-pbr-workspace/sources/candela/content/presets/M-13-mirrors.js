import { scene, shape, material, light, camera, engine, integrator, units as u } from 'candela';

const mirror = material.metal('Ag', { roughness: 0.0 });

export default scene()
  .add(shape.rect(3, 2).at(0, 1, -1.2).rotateX(u.deg(90)).material(mirror))
  .add(shape.rect(3, 2).at(0, 1, 1.2).rotateX(u.deg(-90)).material(mirror))
  .add(shape.sphere(0.2).at(0, 0.7, 0).material(material.plastic('#e0a020', 0.25)))
  .add(shape.torus(0.16, 0.025).at(-0.15, 1.3, -0.4).rotateX(u.deg(90)).material(material.emissive('#40d0ff', u.nit(300))))
  .add(shape.plane(20).material(material.pbr().baseColor('#6a5a48').roughness(0.7)))
  .add(shape.rect(0.6, 0.6).at(0, 2.2, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(1200)).temperature(u.K(3500))))
  .light(light.env.gradient({ top: '#30343a', bottom: '#101010', intensity: u.nit(8) }))
  .camera(camera.thinLens().at(0.45, 1.05, 1.05).lookAt(-0.15, 1.0, -1.2).focal(u.mm(28)).exposure(5.5));

export const engine = engine.offline().integrator(integrator.path({ maxDepth: 24, rr: { after: 16 } }));
