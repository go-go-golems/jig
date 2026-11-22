import { scene, shape, material, light, camera, engine as E, units as u } from 'candela';

const nm = [90, 250, 380, 520, 700, 900];
export default scene()
  .add(nm.map((d, i) => shape.sphere(0.18 + (i % 3) * 0.05).at((i - 2.5) * 0.5, 0.55 + (i % 2) * 0.25, (i % 3) * -0.2).material(material.soapFilm({ thickness: u.nm(d) }))))
  .add(shape.plane(30).material(material.pbr().baseColor(0.04).roughness(0.5)))
  .add(shape.rect(6, 3).at(0, 1.5, -1.5).rotateX(u.deg(90)).material(material.pbr().baseColor(0.04)))
  .light(light.env.studio({ intensity: u.nit(1100) }))
  .camera(camera.thinLens().at(0, 0.8, 3.2).lookAt(0, 0.6, 0).focal(u.mm(40)));

export const engine = E.offline().spectral();
