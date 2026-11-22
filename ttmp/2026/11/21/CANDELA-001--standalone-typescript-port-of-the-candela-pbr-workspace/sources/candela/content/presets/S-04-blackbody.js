import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

const P = params({ hot: param.kelvin(1900).range(1000, 3000).label('Hot end (K)') });
const temp = p => fx.float(1).sub(p.local.y.add(0.6).div(1.2).clamp(0, 1)).pow(1.6).mul(P.hot.sub(500)).add(500);
const wien = T => fx.pow(Math.E, fx.float(-25924).div(T).add(25924 / 2000)).mul(4000);   // nit, 4000 at 2000 K
const poker = material.pbr().baseColor(0.05).roughness(0.6).emission(p => fx.blackbody(temp(p)).mul(wien(temp(p))), u.nit(1));

const T = [1000, 1200, 1400, 1600, 1800, 2000];
export default scene().params(P)
  .add(shape.cylinder(0.025, 1.2).at(0, 0.4, 0).rotateZ(u.deg(75)).material(poker))
  .add(T.map((k, i) => shape.sphere(0.1).at((i - 2.5) * 0.3, 0.1, 0.6).material(material.emissive('#000000', u.nit(1)).emission(fx.blackbody(k), u.nit(200)))))
  .add(shape.plane(30).material(material.pbr().baseColor(0.08).roughness(0.7)))
  .light(light.env.uniform(u.nit(0.5)))
  .camera(camera.thinLens().at(0, 1.0, 2.8).lookAt(0, 0.22, 0.3).focal(u.mm(40)));
