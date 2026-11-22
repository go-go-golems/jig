import { scene, shape, material, light, camera, units as u } from 'candela';

export default scene()
  .add(shape.sphere(0.45).at(-0.6, 0.45, 0).material(material.metal('Au', { roughness: 0.2 })))
  .add(shape.torus(0.32, 0.12).at(0.55, 0.4, 0.1).rotateX(u.deg(60)).material(material.plastic('#1e4bb3', 0.25)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
  .light(light.daylight({ elevation: u.deg(40), azimuth: u.deg(40) }))
  .camera(camera.thinLens().at(0, 1.2, 3.2).lookAt(0, 0.4, 0).focal(u.mm(40)));
