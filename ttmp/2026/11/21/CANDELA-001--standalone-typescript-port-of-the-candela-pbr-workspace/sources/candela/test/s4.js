import { scene, shape, material, light, camera, engine as EN, units as u } from 'candela';
export default scene()
  .add(shape.plane(20).material(material.diffuse(0.5)))
  .add(shape.rect(1, 1).at(0, 2, 0).rotateX(u.deg(180)).emit(light.area().power(u.lm(3000)).temperature(u.K(4000))))
  .camera(camera.thinLens().at(0, 1.5, 4).lookAt(0, 0.4, 0));
export const engine = EN.offline().post();
