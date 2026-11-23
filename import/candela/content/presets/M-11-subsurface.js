import { scene, shape, material, light, camera, units as u } from 'candela';

const wax = material.subsurface({ albedo: [0.95, 0.85, 0.7], meanFreePath: u.mm(6), roughness: 0.4 });
const jade = material.subsurface({ albedo: [0.6, 0.9, 0.7], meanFreePath: u.mm(12), roughness: 0.15 });
const skin = material.subsurface({ albedo: [0.95, 0.75, 0.62], meanFreePath: u.mm(4), roughness: 0.45 });
const marble = material.subsurface({ albedo: [0.97, 0.96, 0.94], meanFreePath: u.mm(10), roughness: 0.2 });

export default scene()
  .add(shape.cylinder(0.12, 0.42).at(-0.75, 0.21, 0).material(wax))
  .add(shape.torus(0.13, 0.05).at(-0.25, 0.05, 0.1).material(jade))
  .add(shape.sphere(0.15).at(0.25, 0.15, 0).material(skin))
  .add(shape.roundedBox(0.3, 0.3, 0.3, 0.03).at(0.75, 0.15, 0).rotateY(u.deg(30)).material(marble))
  .add(shape.plane(20).material(material.pbr().baseColor(0.15).roughness(0.7)))
  .add(shape.rect(0.8, 0.8).at(0, 0.7, -1.0).facing(0, 0.15, 0).emit(light.area().power(u.lm(3000)).temperature(u.K(4000))))
  .light(light.env.uniform(u.nit(20)))
  .camera(camera.thinLens().at(0, 0.75, 2.4).lookAt(0, 0.15, 0).focal(u.mm(35)).fstop(5.6));
