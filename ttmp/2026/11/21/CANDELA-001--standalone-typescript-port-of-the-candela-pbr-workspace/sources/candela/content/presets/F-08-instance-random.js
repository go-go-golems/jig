import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const pebble = material.pbr()
  .baseColor(p => fx.ramp(p.instance.random, [[0, '#4a4440'], [0.3, '#8a7f72'], [0.6, '#b9ab98'], [0.85, '#6f6a60'], [1, '#c8b89e']]))
  .roughness(p => fx.mix(0.35, 0.8, p.instance.random));

const beach = scene.group((g, { rng }) => {
  for (let i = 0; i < 400; i++) {
    const r = 0.05 + rng() * 0.07, x = (rng() - 0.5) * 4, z = (rng() - 0.5) * 3;
    g.add(shape.sphere(r).at(x, r * 0.55, z).scale(1, 0.55, 0.8 + rng() * 0.4).rotateY(rng() * 6.28).material(pebble));
  }
});

export default scene()
  .add(beach)
  .add(shape.plane(40).material(material.pbr().baseColor('#cbb994').roughness(0.95)))
  .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(60) }))
  .camera(camera.thinLens().at(0, 1.4, 2.4).lookAt(0, 0, 0).focal(u.mm(35)).fstop(4).focus(2.6));
