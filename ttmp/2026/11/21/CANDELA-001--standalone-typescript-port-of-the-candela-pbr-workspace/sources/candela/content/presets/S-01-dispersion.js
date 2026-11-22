import { scene, shape, material, bsdf, ior, light, camera, engine as E, fx, param, params, units as u } from 'candela';

const P = params({ spectral: param.bool(true).label('Spectral').static() });
const flint = material(bsdf.dielectric({ ior: ior.glass('SF11') }));
const stripes = material.emissive('#000000', u.nit(1)).emission(p => fx.color(1).mul(fx.stripes(p.P.x, 6, 0.7)), u.nit(250));

export default scene().params(P)
  .add(shape.sphere(0.45).at(-0.55, 0.5, 0.2).material(flint))
  .add(shape.prism({ size: 0.5, depth: 0.9 }).at(0.6, 0.3, 0.1).rotateX(u.deg(90)).rotateY(u.deg(20)).material(flint))
  .add(shape.rect(8, 6).at(0, 1.5, -1.0).rotateX(u.deg(90)).material(stripes))
  .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.6)))
  .light(light.env.uniform(u.nit(40)))
  .camera(camera.thinLens().at(0, 0.6, 2.6).lookAt(0, 0.45, 0).focal(u.mm(45)));

export const engine = P.spectral.value ? E.offline().spectral() : E.offline();
