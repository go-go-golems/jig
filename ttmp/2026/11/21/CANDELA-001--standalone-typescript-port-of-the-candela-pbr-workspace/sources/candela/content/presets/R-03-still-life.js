import { scene, shape, material, bsdf, light, camera, fx, units as u } from 'candela';

const wood = material.pbr().roughness(0.6).coat(1).coatRoughness(0.2).coatColor('#e0b070')
  .baseColor(p => fx.ramp(fx.noise.fbm(p.P.mul(fx.vec3(30, 2, 2)), { octaves: 4 }).mul(0.5).add(0.5), [[0, '#4a2c18'], [1, '#8a5a30']]));
const orange = material.subsurface({ albedo: [0.95, 0.5, 0.1], meanFreePath: u.mm(3), roughness: 0.5 });
const apple = material.subsurface({ albedo: [0.75, 0.12, 0.08], meanFreePath: u.mm(2), roughness: 0.25 });
const cloth = material(bsdf.layer(bsdf.sheen({ color: '#e8d0b0', roughness: 0.4 }), bsdf.lambert('#7a1e2a')));

export default scene()
  .add(shape.box(2.2, 0.06, 1.2).at(0, 0.75, 0).material(wood))
  .add(shape.roundedBox(0.7, 0.02, 0.5, 0.01).at(0.15, 0.79, 0.05).rotateY(u.deg(12)).material(cloth))
  .add(shape.sphere(0.07).at(0.1, 0.87, 0.05).material(orange), shape.sphere(0.065).at(0.26, 0.865, 0.12).material(orange))
  .add(shape.sphere(0.07).scale(1, 0.9, 1).at(0.0, 0.863, 0.2).material(apple))
  .add(shape.cylinder(0.07, 0.3).at(-0.3, 0.93, -0.15).material(material.glass({ ior: 1.5 })))
  .add(shape.cylinder(0.065, 0.2).at(-0.3, 0.88, -0.15).material(material.glass({ ior: 1.34, absorb: '#6a0a14', distance: u.cm(2) })))
  .add(shape.cylinder(0.025, 0.12).at(-0.3, 1.14, -0.15).material(material.glass({ ior: 1.5 })))
  .add(shape.rect(1.2, 1.4).at(-1.6, 1.5, 0.3).facing(0, 0.8, 0).emit(light.area().power(u.lm(20000)).temperature(u.K(5600))))
  .add(shape.rect(5, 3).at(0, 1.5, -0.9).rotateX(u.deg(90)).material(material.pbr().baseColor('#6a6050').roughness(0.9)))
  .add(shape.plane(30).material(material.pbr().baseColor('#3a3028').roughness(0.8)))
  .light(light.env.uniform(u.nit(3)).temperature(u.K(3000)))
  .camera(camera.thinLens().at(0.4, 1.15, 1.5).lookAt(-0.02, 0.88, 0).focal(u.mm(55)).fstop(4));
