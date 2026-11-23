import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

const P = params({ v: param.choice(['marble', 'brushed', 'glass'], 'marble').label('Variant') });
const variants = {
  marble: material.pbr().roughness(0.2).coat(1).baseColor(p => fx.mix(fx.color('#30302e'), fx.color('#ece8e0'), p.P.x.mul(4).add(fx.noise.turbulence(p.P.mul(2)).mul(3)).sin().abs().pow(0.3))),
  brushed: material.metal('Al', { roughness: 0.3 }),
  glass: material.glass({ ior: 1.5, absorb: '#a0d0e0', distance: u.cm(30) }),
};

export default scene().params(P)
  .add(shape.torus(0.45, 0.18).at(0, 0.6, 0).rotateX(u.deg(65)).material(P.v.pick(variants)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.35)))
  .light(light.env.studio({ intensity: u.nit(900) }))
  .camera(camera.thinLens().at(0, 1.3, 2.8).lookAt(0, 0.5, 0).focal(u.mm(42)));
