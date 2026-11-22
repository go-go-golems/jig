import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const gold = material.metal('Au', { roughness: 0.18 });
const steel = material.metal('Fe', { roughness: 0.25 });
const ring = (R, m) => shape.torus(R, 0.025).material(m);

const inner = scene.group([ring(0.36, gold), shape.sphere(0.12).material(material.glass({ ior: 1.5, absorb: '#c03020', distance: u.cm(10) }))]).rotateX(fx.time().mul(1.618).add(0.9));
const mid = scene.group([ring(0.48, steel), inner]).rotateZ(fx.time().mul(Math.SQRT2).add(0.6));
const outer = scene.group([ring(0.6, gold), mid]).rotateX(u.deg(70)).rotateY(fx.time());

export default scene()
  .add(outer.at(0, 1.0, 0))
  .add(shape.cylinder(0.02, 0.4).at(0, 0.2, 0).material(steel))
  .add(shape.cylinder(0.3, 0.04).at(0, 0.02, 0).material(material.pbr().baseColor(0.06).roughness(0.3)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.3).roughness(0.6)))
  .light(light.env.studio({ intensity: u.nit(900), rotate: u.deg(20) }))
  .camera(camera.thinLens().at(0, 1.3, 3).lookAt(0, 0.9, 0).focal(u.mm(45)));
