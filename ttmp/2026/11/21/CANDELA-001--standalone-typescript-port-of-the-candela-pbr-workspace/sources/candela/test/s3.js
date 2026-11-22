import { scene, shape, material, light, camera, engine as EN, units as u } from 'candela';
export default scene()
  .add(shape.plane(20).material(material.diffuse(0.5)))
  .add(shape.sphere(0.5).at(0, 0.5, 0).material(material.diffuse(0.5)))
  .light(light.env.uniform(u.nit(100)))
  .camera(camera.thinLens().at(0, 1.5, 4).lookAt(0, 0.4, 0));
export const engine = EN.offline().post();
