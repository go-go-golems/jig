import { scene, shape, material, bsdf, ior, light, camera, medium, phase, engine as E0, pass, fx, param, params, integrator, units as u } from 'candela';
const P = params({ rough: param.float(0.3).range(0, 1), tint: param.color('#3060c0'), on: param.bool(true) });
const tiles = fx.pattern(p => fx.checker(p.uv.mul(0.5), 2).mix(fx.color(0.7), fx.color(0.1)));
const gold = material.metal('Au', { roughness: 0.2 });
const glass = material.glass({ ior: ior.glass('N-BK7') });
const coat = material(bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.03 }), bsdf.lambert(P.tint), { tint: '#fff0e0' }));
const bumpy = material.pbr().baseColor('#8a8a80').roughness(P.rough).normal(fx.bump(p => fx.noise.fbm(p.P.mul(8)).mul(0.01), 1));
const film = material.soapFilm();
const knot = shape.sdf(p => p.P.length().sub(0.5).add(fx.noise.perlin(p.P.mul(4)).mul(0.05)), { bound: 0.7 });

export default scene()
  .add(shape.plane(20).material(material.pbr().baseColor(tiles).roughness(0.6)).id('floor'))
  .add(shape.sphere(0.5).at(-1.6, 0.5, 0).material(gold))
  .add(shape.sphere(0.5).at(-0.5, 0.5, 0).material(glass))
  .add(shape.box(0.8).at(0.6, 0.4, 0).rotateY(u.deg(30)).material(coat))
  .add(shape.torus(0.4, 0.15).at(1.8, 0.4, 0).rotateX(u.deg(70)).material(bumpy))
  .add(shape.sphere(0.35).at(0, 1.6, -0.5).material(film))
  .add(knot.at(-1, 1.5, -1).material(material.subsurface()))
  .add(shape.cylinder(0.2, 1).at(2.5, 0.5, -1).material(material.ceramic('#d0c8b0')))
  .add(shape.rect(1.5, 0.8).at(0, 3, 1).rotateX(u.deg(180)).emit(light.area().power(u.lm(3000)).temperature(u.K(4000))))
  .light(light.spot().at(-2, 3, 2).aim(0, 0, 0).power(u.lm(1200)).cone(u.deg(25)))
  .light(light.bulb(800, 2700).at(2, 1.5, 1))
  .light(light.env.studio({ intensity: u.nit(300) }))
  .medium(medium.homogeneous({ albedo: 0.95, meanFreePath: u.m(30), phase: phase.hg(0.6) }))
  .camera(camera.thinLens().at(0, 1.5, 5).lookAt(0, 0.6, 0).focal(u.mm(35)).fstop(4));

const vig = pass.define('vig', { kernel: ({ color, uv }) => color.mul(fx.float(1).sub(uv.sub(0.5).length().mul(0.6))) });
export const engine = E0.offline().post(pass.tonemap('agx'), vig(), pass.bloom());
