import { scene, shape, material, light, camera, units as u } from 'candela';

const neon = (c, L) => material.emissive(c, u.nit(L));

export default scene()
  .add(shape.capsule(0.03, 1.4).at(-1.2, 1.4, -0.9).rotateZ(u.deg(90)).material(neon('#ff3070', 900)))
  .add(shape.capsule(0.03, 0.9).at(-1.6, 0.8, -0.9).material(neon('#30c0ff', 900)))
  .add(shape.torus(0.35, 0.03).at(-0.6, 0.75, -0.9).rotateX(u.deg(90)).material(neon('#ffe040', 900)))
  .add(shape.rect(0.4, 1.2).at(1.4, 1.0, -0.9).rotateX(u.deg(90)).emit(light.area().power(u.lm(1600)).color('#a0ffb0')))
  .add(shape.rect(8, 4).at(0, 2, -1).rotateX(u.deg(90)).material(material.pbr().baseColor(0.35).roughness(0.9)))
  .add(shape.plane(20).material(material.pbr().baseColor(0.05).roughness(0.12)))
  .add(shape.sphere(0.3).at(0.4, 0.3, 0.4).material(material.pbr().baseColor(0.7).roughness(0.3)))
  .camera(camera.thinLens().at(0, 1.2, 3.8).lookAt(0, 0.8, -0.5).focal(u.mm(32)));
