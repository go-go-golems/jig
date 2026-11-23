import { scene, shape, material, light, camera, units as u } from 'candela';

const sweep = material.pbr().baseColor('#d8d4cc').roughness(0.9);
const glaze = material.ceramic('#2a5a78');
const mug = scene.group([
  shape.cylinder(0.09, 0.2).at(0, 0.1, 0).material(glaze),
  shape.torus(0.055, 0.015).at(0.1, 0.11, 0).rotateX(u.deg(90)).material(glaze),
  shape.cylinder(0.08, 0.005).at(0, 0.198, 0).material(material.pbr().baseColor('#3e2a1c').roughness(0.05).coat(1)),   // coffee
]);

export default scene()
  .add(shape.cylinder(0.16, 0.012).at(0, 0.006, 0).material(material.ceramic('#ece8e0')))
  .add(mug.at(0, 0.012, 0))
  .add(shape.capsule(0.008, 0.16).at(0.17, 0.016, 0.1).rotateZ(u.deg(90)).rotateY(u.deg(30)).material(material.metal('Cr', { roughness: 0.12 })))
  .add(shape.plane(10).material(sweep))
  .add(shape.cylinder(0.6, 3).at(0, 0.6, -0.6).rotateZ(u.deg(90)).material(sweep))
  .add(shape.rect(3, 2).at(0, 1.6, -1.2).rotateX(u.deg(90)).material(sweep))
  .add(shape.rect(0.9, 0.9).at(-0.7, 0.6, 0.5).facing(0, 0.1, 0).emit(light.area().power(u.lm(5000)).temperature(u.K(5500))))
  .add(shape.rect(0.12, 0.8).at(0.5, 0.45, -0.4).facing(0, 0.1, 0).emit(light.area().power(u.lm(1500)).temperature(u.K(6000))))
  .light(light.env.uniform(u.nit(15)))
  .camera(camera.thinLens().at(0.15, 0.32, 0.9).lookAt(0.02, 0.1, 0).focal(u.mm(70)).fstop(8));
