import { scene, shape, material, light, camera, units as u } from 'candela';

const steel = material.metal('Fe', { roughness: 0.3 });
const peg = shape.cylinder(0.05, 0.6).material(steel);

export default scene()
  .add([-0.6, -0.2, 0.2, 0.6].map(x => peg.at(x, 0.3, 0)))
  .add(shape.torus(0.2, 0.05).at(-0.6, 0.05, 0).rotateX(u.deg(90)).material(material.plastic('#c8452e')))
  .add(shape.torus(0.16, 0.05).at(-0.6, 0.15, 0).rotateX(u.deg(90)).material(material.plastic('#e0a03c')))
  .add(shape.plane(30).material(material.pbr().baseColor(0.5)))
  .light(light.daylight({ elevation: u.deg(45) }))
  .camera(camera.thinLens().at(0, 1, 2.6).lookAt(0, 0.3, 0).focal(u.mm(45)));
