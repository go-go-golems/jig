import { scene, shape, material, medium, phase, light, camera, units as u } from 'candela';

const glass = material.glass({ ior: 1.5 });
const liquid = m => material.glass({ ior: 1.34 }).interior(m);
const water = liquid(medium.absorbing({ tint: [0.82, 0.96, 0.97], distance: u.m(1) }));
const wine = liquid(medium.absorbing({ tint: '#c01828', distance: u.cm(15) }));
const milk = liquid(medium.homogeneous({ albedo: 0.995, meanFreePath: u.mm(0.5), phase: phase.hg(0.6) }));

const cup = (x, m) => scene.group([
  shape.cylinder(0.2, 0.5).at(x, 0.25, 0).material(glass),
  shape.cylinder(0.185, 0.36).at(x, 0.2, 0).material(m),
]);

export default scene()
  .add(cup(-0.5, water), cup(0, wine), cup(0.5, milk))
  .add(shape.plane(30).material(material.pbr().baseColor(0.75).roughness(0.6)))
  .add(shape.rect(4, 2).at(0, 1, -1).rotateX(u.deg(90)).material(material.pbr().baseColor(0.75).roughness(0.6)))
  .light(light.env.studio({ intensity: u.nit(900) }))
  .camera(camera.thinLens().at(0, 0.6, 2.4).lookAt(0, 0.25, 0).focal(u.mm(45)));
