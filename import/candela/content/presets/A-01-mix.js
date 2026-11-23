import { scene, shape, material, bsdf, light, camera, fx, param, params, units as u } from 'candela';

const P = params({ t: param.float(0.5).range(0, 1).label('Mix t') });
const blue = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.05 }), bsdf.lambert('#1d4f9a'));
const gold = bsdf.conductor({ ior: 'Au', roughness: 0.2 });

export default scene().params(P)
  .add(shape.sphere(0.5).at(-0.65, 0.5, 0).material(material(bsdf.mix(blue, gold, P.t))))
  .add(shape.sphere(0.5).at(0.65, 0.5, 0).material(material(bsdf.mix(blue, gold, p => fx.stripes(p.P.y, 7, 0.7)))))
  .add(shape.plane(30).material(material.pbr().baseColor(0.4)))
  .light(light.env.studio({ intensity: u.nit(900) }))
  .camera(camera.thinLens().at(0, 1.0, 3.2).lookAt(0, 0.5, 0).focal(u.mm(45)));
