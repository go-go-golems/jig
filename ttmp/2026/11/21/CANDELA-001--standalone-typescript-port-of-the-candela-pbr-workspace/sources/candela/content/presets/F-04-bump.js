import { scene, shape, material, bsdf, light, camera, fx, param, params, units as u } from 'candela';

const P = params({ depth: param.float(1).range(0, 3).label('Dent depth (mm)') });
const dents = p => fx.noise.voronoi(p.P.mul(14)).dist.pow(2).mul(P.depth).mul(-0.012);
const scratches = p => fx.noise.perlin(p.P.mul(fx.vec3(2, 160, 2))).mul(0.0006);

const silver = bsdf.conductor({ ior: 'Ag', roughness: 0.08 });
const steel = bsdf.conductor({ ior: 'Fe', roughness: 0.18 });

export default scene().params(P)
  .add(shape.sphere(0.45).at(-1.0, 0.45, 0).material(material(silver).normal(fx.bump(dents, 1))))
  .add(shape.sphere(0.45).at(0, 0.45, 0).material(material(silver)))
  .add(shape.cylinder(0.4, 0.9).at(1.0, 0.45, 0).material(material(steel).normal(fx.bump(scratches, 1))))
  .add(shape.plane(30).material(material.pbr().baseColor(0.1).roughness(0.6)))
  .light(light.env.studio({ intensity: u.nit(1000), rotate: u.deg(-20) }))
  .camera(camera.thinLens().at(0, 1.1, 3.6).lookAt(0, 0.45, 0).focal(u.mm(42)));
