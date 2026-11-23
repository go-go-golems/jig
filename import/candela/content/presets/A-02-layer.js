import { scene, shape, material, bsdf, light, camera, fx, param, params, units as u } from 'candela';

const P = params({ thick: param.float(0.3).range(0, 1).label('Varnish thickness') });
const grain = p => fx.ramp(fx.noise.fbm(p.P.mul(fx.vec3(4, 40, 4)), { octaves: 4 }).mul(0.5).add(0.5), [[0, '#3c2210'], [0.6, '#7a4a24'], [1, '#a8703c']]);
const wood = bsdf.lambert(grain);
const varnished = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.05 }), wood, { tint: '#e0a040', thickness: P.thick });

export default scene().params(P)
  .add(shape.box(1.0, 0.08, 2.2).at(-0.6, 0.04, 0).material(material(wood)))
  .add(shape.box(1.0, 0.08, 2.2).at(0.6, 0.04, 0).material(material(varnished)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.25)))
  .light(light.point().at(0.4, 1.4, -1.6).power(u.lm(5000)).radius(0.06))
  .light(light.env.uniform(u.nit(30)))
  .camera(camera.thinLens().at(0, 1.2, 2.6).lookAt(0, 0, -0.3).focal(u.mm(35)));
