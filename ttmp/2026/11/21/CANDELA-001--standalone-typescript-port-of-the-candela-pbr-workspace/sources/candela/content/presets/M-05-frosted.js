import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const rough = [0, 0.1, 0.25, 0.5];
const stripes = material.pbr().roughness(0.5).baseColor(p => fx.mix(fx.color('#1a1a1a'), fx.color('#e6dcc8'), fx.stripes(p.P.x, 6)));

export default scene()
  .add(rough.map((r, i) => shape.roundedBox(0.8, 1.2, 0.05, 0.01).at((i - 1.5) * 0.95, 0.65, 0).material(material.glass({ ior: 1.5, roughness: r }))))
  .add(shape.rect(5, 2.5).at(0, 1.25, -0.6).rotateX(u.deg(90)).material(stripes))
  .add(shape.sphere(0.12).at(0.45, 0.4, -0.15).material(material.plastic('#2a6fd0', 0.3)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.4)))
  .light(light.env.studio({ intensity: u.nit(900) }))
  .camera(camera.thinLens().at(0, 0.8, 3.4).lookAt(0, 0.65, 0).focal(u.mm(45)));
