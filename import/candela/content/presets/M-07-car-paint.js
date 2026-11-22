import { scene, shape, material, bsdf, ior, light, camera, param, params, units as u } from 'candela';

const P = params({
  pigment: param.color('#9c1420').label('Pigment'),
  flakes: param.float(0.1).range(0, 1).label('Flakes'),
  coat: param.float(0.02).range(0, 0.4).label('Coat roughness'),
});
const paint = material(bsdf.layer(
  bsdf.dielectric({ ior: 1.5, roughness: P.coat }),
  bsdf.mix(bsdf.lambert(P.pigment), bsdf.conductor({ ior: ior.metal('Al'), roughness: 0.3 }), P.flakes)));
const tyre = material.rubber(0.03);
const chrome = material.metal('Cr', { roughness: 0.05 });

const wheel = (x, z) => scene.group([
  shape.cylinder(0.33, 0.24).at(x, 0.33, z).rotateX(u.deg(90)).material(tyre),
  shape.cylinder(0.2, 0.25).at(x, 0.33, z).rotateX(u.deg(90)).material(chrome),
]);

export default scene().params(P)
  .add(shape.roundedBox(3.6, 0.7, 1.7, 0.3).at(0, 0.7, 0).material(paint).id('body'))
  .add(shape.roundedBox(2.0, 0.6, 1.5, 0.28).at(-0.2, 1.25, 0).material(paint))
  .add(shape.roundedBox(1.9, 0.42, 1.52, 0.2).at(-0.2, 1.28, 0).material(material.glass({ ior: 1.5, absorb: '#304040', distance: u.cm(1) })))
  .add([wheel(-1.15, 0.8), wheel(1.15, 0.8), wheel(-1.15, -0.8), wheel(1.15, -0.8)])
  .add(shape.plane().material(material.pbr().baseColor(0.2).roughness(0.35)))
  .light(light.env.studio({ intensity: u.nit(1100), rotate: u.deg(30) }))
  .camera(camera.thinLens().at(4.6, 1.8, 4.2).lookAt(0, 0.75, 0).focal(u.mm(45)).fstop(8));
