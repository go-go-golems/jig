import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const floor = material.pbr().roughness(0.6).baseColor(p => fx.mix(fx.color(0.15), fx.color(0.7), fx.stripes(p.P.x.add(p.time.mul(0.2)), 3)));
const ring = material.emissive('#000000', u.nit(1)).emission(p => fx.color('#ff7a30').mul(p.time.mul(4).sin().mul(0.5).add(0.6)), u.nit(500));
const globe = material.pbr().roughness(0.5).baseColor(p => fx.mix(fx.color('#1d4f9a'), fx.color('#3a7a3a'), fx.noise.fbm(p.local.mul(2.5), { octaves: 5 }).smoothstep(0.0, 0.08)));

export default scene()
  .add(shape.sphere(0.5).at(0, 0.6, 0).rotateY(fx.time().mul(0.4)).material(globe))
  .add(shape.torus(0.75, 0.03).at(0, 0.6, 0).rotateX(u.deg(75)).material(ring))
  .add(shape.plane(30).material(floor))
  .light(light.env.gradient({ top: '#bcd0e8', bottom: '#2a2a2a', intensity: u.nit(400) }))
  .camera(camera.thinLens().at(0, 1.4, 3.2).lookAt(0, 0.5, 0).focal(u.mm(40)));
