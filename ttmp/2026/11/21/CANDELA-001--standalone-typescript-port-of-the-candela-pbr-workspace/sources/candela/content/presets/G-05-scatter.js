import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const bark = material.pbr().baseColor('#4a3424').roughness(0.9);
const leaves = material.pbr().roughness(0.8).baseColor(p => fx.ramp(p.instance.random, [[0, '#1f3a1c'], [1, '#4d6a2a']]));

const tree = rng => {
  const h = 0.8 + rng() * 1.2, r = 0.25 + rng() * 0.25;
  return scene.group([
    shape.cylinder(0.05, h * 0.5).at(0, h * 0.25, 0).material(bark),
    shape.cone(r, h).at(0, h * 0.75, 0).material(leaves),
  ]);
};

const forest = scene.scatter({
  count: 220, seed: 7, area: [16, 16],
  density: p => p.P.xz.length().smoothstep(1.8, 3.2).mul(fx.noise.fbm(p.P.mul(0.4)).add(0.6)),
  place: (i, { rng, P }) => tree(rng).at(P[0], 0, P[2]),
});

export default scene()
  .add(forest)
  .add(shape.sphere(0.3).at(0, 0.3, 0).material(material.pbr().baseColor('#b3261e').roughness(0.3)))
  .add(shape.plane().material(material.pbr().baseColor('#5a6a3a').roughness(0.95)))
  .light(light.daylight({ elevation: u.deg(30), azimuth: u.deg(80) }))
  .camera(camera.thinLens().at(0, 4.5, 8).lookAt(0, 0, 0).focal(u.mm(30)));
