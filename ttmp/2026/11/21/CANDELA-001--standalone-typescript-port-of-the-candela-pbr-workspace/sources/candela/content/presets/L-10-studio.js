import { scene, shape, material, light, camera, ior, medium, units as u } from 'candela';

const glass = material.glass({ ior: 1.5 });
const perfume = material.glass({ ior: 1.36, absorb: '#e8b45c', distance: u.cm(20) });

export default scene()
  .add(shape.roundedBox(0.5, 0.7, 0.22, 0.04).at(0, 0.35, 0).material(glass))
  .add(shape.roundedBox(0.44, 0.5, 0.16, 0.03).at(0, 0.3, 0).material(perfume))
  .add(shape.cylinder(0.09, 0.22).at(0, 0.81, 0).material(material.metal('Cr', { roughness: 0.06 })))
  .add(shape.cylinder(1.4, 0.04).at(0, -0.02, 0).material(material.pbr().baseColor(0.04).roughness(0.15)))
  .light(light.env.studio({ intensity: u.nit(1200), rotate: u.deg(20) }))
  .camera(camera.thinLens().at(0.3, 0.55, 2.4).lookAt(0, 0.4, 0).focal(u.mm(70)).fstop(5.6));
