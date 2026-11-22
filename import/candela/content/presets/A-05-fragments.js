import { scene, shape, material, light, camera, param, params, units as u } from 'candela';
import { rust, weathering } from 'candela/fragments';

const P = params({ rust: param.float(0.45).range(0, 1).label('Rust'), age: param.float(6).range(0, 30).label('Age (years)') });

const steel = material.pbr().baseColor('#8a8c8e').metallic(1).roughness(0.3);
const paint = material.pbr().baseColor('#2f6e4a').roughness(0.4);

export default scene().params(P)
  .add(shape.cylinder(0.35, 1.2).at(-0.8, 0.6, 0).material(steel.with(rust).rust(P.rust).rustScale(5)))
  .add(shape.roundedBox(1.0, 0.9, 0.9, 0.06).at(0.6, 0.45, 0).material(paint.metallic(0).with(weathering).aged(P.age)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.35).roughness(0.9)))
  .light(light.daylight({ elevation: u.deg(40), azimuth: u.deg(60) }))
  .camera(camera.thinLens().at(0, 1.4, 3.2).lookAt(0, 0.5, 0).focal(u.mm(40)));
