import { scene, shape, material, bsdf, light, camera, units as u } from 'candela';

const colour = '#5b1a3a';
const velvet = material(bsdf.layer(bsdf.sheen({ color: '#f0c0d8', roughness: 0.35 }), bsdf.lambert(colour)));
const matte = material.diffuse(colour);

const cushion = (m, x) => scene.group([
  shape.roundedBox(1.0, 0.35, 1.0, 0.16).at(x, 0.18, 0).material(m),
  shape.sphere(0.32).at(x, 0.62, 0).scale(1, 0.85, 1).material(m),
]);

export default scene()
  .add(cushion(velvet, -0.7), cushion(matte, 0.7))
  .add(shape.plane(30).material(material.pbr().baseColor(0.5).roughness(0.6)))
  .light(light.env.studio({ intensity: u.nit(700), rotate: u.deg(60) }))
  .light(light.sun().elevation(u.deg(20)).azimuth(u.deg(220)).illuminance(u.lux(20000)))
  .camera(camera.thinLens().at(0, 1.4, 3.2).lookAt(0, 0.35, 0).focal(u.mm(45)));
