import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const N = 30, s = 0.12;
const cube = shape.box(s * 0.92, 1, s * 0.92);
const m = material.pbr().roughness(0.4).baseColor(p => fx.ramp(p.P.y.mul(1.4), [[0, '#183a5a'], [0.5, '#3aa0a0'], [1, '#f0e0a0']]));

const field = scene.group(g => {
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i - N / 2) * s, z = (j - N / 2) * s, r = Math.hypot(x, z);
    const h = 0.15 + 0.35 * (1 + Math.sin(r * 5 - x * 1.5)) * Math.exp(-r * 0.35);
    g.add(cube.at(x, h / 2, z).scale(1, h, 1).material(m));
  }
});

export default scene()
  .add(field)
  .add(shape.plane(40).material(material.pbr().baseColor(0.1)))
  .light(light.daylight({ elevation: u.deg(38), azimuth: u.deg(130) }))
  .camera(camera.thinLens().at(2.6, 2.4, 3.4).lookAt(0, 0.1, 0).focal(u.mm(35)));
