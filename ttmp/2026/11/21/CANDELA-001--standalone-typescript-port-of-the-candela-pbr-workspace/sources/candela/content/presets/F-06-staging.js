import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const OCTAVES = 4;                     // a JS number: decides the shape of the code, not a uniform

const ripple = p => {
  let h = fx.float(0);
  for (let k = 0; k < OCTAVES; k++) h = h.add(p.P.xz.length().mul(2 ** k * 8).sin().mul(0.5 ** k));
  return h.mul(0.0015);
};

const water = material.pbr().baseColor('#1a4452').roughness(0.02).coat(1).coatRoughness(0.0).normal(fx.bump(ripple, 1));

// fx.pattern(p => (p.P.y > 0 ? 1 : 0));   // E202: branch on a field — use fx.select(p.P.y.gt(0), 1, 0)

export default scene()
  .add(shape.disk(3).at(0, 0.01, 0).material(water))
  .add(shape.torus(3.0, 0.12).at(0, 0.02, 0).material(material.pbr().baseColor('#8d877c').roughness(0.8)))
  .add(shape.plane(40).material(material.pbr().baseColor('#4a5a3a').roughness(0.95)))
  .light(light.daylight({ elevation: u.deg(30), azimuth: u.deg(200) }))
  .camera(camera.thinLens().at(0, 2.0, 4.6).lookAt(0, 0, 0).focal(u.mm(35)));
