import { scene, shape, material, light, camera, fx, param, params, units as u } from 'candela';

const P = params({
  warp: param.float(2.4).range(0, 6).label('Warp'),
  sharp: param.float(6).range(1, 24).label('Vein sharpness'),
});

const veins = p => {
  const q = p.P.mul(1.6);
  const v = q.x.add(fx.noise.turbulence(q, { octaves: 6 }).mul(P.warp)).mul(3).sin().abs().pow(P.sharp.mul(0.25));
  return fx.mix(fx.color('#3c3a3a'), fx.color('#ece8e0'), v);
};
const marble = material.pbr().baseColor(veins).roughness(0.15).coat(1).coatRoughness(0.03);

export default scene().params(P)
  .add(shape.roundedBox(1.0, 1.0, 1.0, 0.04).at(-0.7, 0.5, 0).rotateY(u.deg(25)).material(marble))
  .add(shape.sphere(0.45).at(0.75, 0.45, 0.2).material(marble))
  .add(shape.plane(30).material(material.pbr().baseColor(0.12).roughness(0.5)))
  .light(light.env.studio({ intensity: u.nit(900), rotate: u.deg(40) }))
  .camera(camera.thinLens().at(0, 1.5, 3.4).lookAt(0, 0.45, 0).focal(u.mm(40)));
