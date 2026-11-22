import { scene, shape, material, light, camera, units as u } from 'candela';
export default scene()
  .add(shape.sphere(1).material(material.pbr().baseColor('#c8553d').roughness(0.4)))
  .add(shape.plane(20).at(0, -1, 0).material(material.pbr().baseColor(0.18)))
  .light(light.daylight({ elevation: u.deg(40), turbidity: 3 }))
  .camera(camera.thinLens().at(0, 0.6, 5).lookAt(0, 0, 0));
