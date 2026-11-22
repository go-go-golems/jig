import { scene, shape, material, light, camera, engine as E, integrator, fx, param, params, units as u } from 'candela';

const P = params({ view: param.choice(['path', 'albedo', 'normals', 'depth', 'ao'], 'path').label('Integrator') });
const brick = material.pbr().roughness(0.8).baseColor(p => fx.mix(fx.color('#8a3a24'), fx.color('#c8bca8'), fx.noise.voronoi(p.P.mul(5)).edge.smoothstep(0.05, 0.0)));

export default scene().params(P)
  .add(shape.torus(0.4, 0.15).at(-0.8, 0.55, 0).rotateX(u.deg(70)).material(material.metal('Cu', { roughness: 0.25 })))
  .add(shape.roundedBox(0.7, 0.7, 0.7, 0.08).at(0.5, 0.35, -0.3).rotateY(u.deg(30)).material(brick))
  .add(shape.sphere(0.3).at(0.4, 0.3, 0.7).material(material.glass({ ior: 1.5 })))
  .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
  .light(light.daylight({ elevation: u.deg(40), azimuth: u.deg(50) }))
  .camera(camera.thinLens().at(0, 1.4, 3.2).lookAt(0, 0.35, 0).focal(u.mm(38)));

export const engine = E.realtime().integrator(P.view.pick({
  path: integrator.path(), albedo: integrator.albedo(), normals: integrator.normals(), depth: integrator.depth(), ao: integrator.ao({ radius: 0.8 }),
}));
