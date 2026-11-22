import { scene, shape, material, light, camera, units as u } from 'candela';

const green = material.glass({ ior: 1.52, absorb: '#6cc890', distance: u.cm(2) });
const t = [1, 2, 4, 8];

export default scene()
  .add(t.map((cm, i) => shape.box(0.5, 0.7, cm / 100).at((i - 1.5) * 0.7, 0.35, 0).material(green)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.85).unchecked('W330')))
  .light(light.sun().elevation(u.deg(40)).azimuth(u.deg(160)).illuminance(u.lux(80000)))
  .light(light.sky.physical({ turbidity: 3 }).fromSun())
  .camera(camera.thinLens().at(0.4, 1.3, 2.6).lookAt(0, 0.3, 0).focal(u.mm(40)));
