import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const N = 100, s = 0.06;
const ball = shape.sphere(s * 0.45);
const m = material.pbr().roughness(0.3).baseColor(p => fx.ramp(p.instance.random, [[0, '#f04a2a'], [0.33, '#f0c02a'], [0.66, '#2ab0f0'], [1, '#f0f0f0']]));

const grid = scene.group(g => {
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i - N / 2) * s, z = (j - N / 2) * s;
    g.add(ball.at(x, s * 0.45 + 0.25 * Math.sin(x * 2.2) * Math.cos(z * 1.7) + 0.25, z).material(m));
  }
});

export default scene()
  .add(grid)
  .add(shape.plane(40).material(material.pbr().baseColor(0.1)))
  .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(140) }))
  .camera(camera.thinLens().at(3.6, 2.4, 3.6).lookAt(0, 0.1, 0).focal(u.mm(35)));
