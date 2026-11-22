import { scene, shape, material, bsdf, light, camera, units as u } from 'candela';

const felt = material(bsdf.layer(bsdf.sheen({ color: '#a0c8a0', roughness: 0.45 }), bsdf.lambert('#1a5a2a')));
const ball = c => material.pbr().baseColor(c).roughness(0.3).coat(1).coatRoughness(0.01);
const cols = ['#e8c020', '#1a40b0', '#c0201a', '#5a1a7a', '#e06010', '#1a6a2a', '#7a1a1a', '#323232'];
const R = 0.0286;

export default scene()
  .add(shape.box(2.54, 0.04, 1.27).at(0, 0.78, 0).material(felt))
  .add(cols.map((c, i) => shape.sphere(R).at(0.3 + (i % 4) * 0.07, 0.8 + R, -0.12 + Math.floor(i / 4) * 0.08 + (i % 4) * 0.012).material(ball(c))))
  .add(shape.sphere(R).at(-0.4, 0.8 + R, 0.05).material(ball('#f2eee4').unchecked('W330')))
  .add(shape.box(2.74, 0.1, 0.12).at(0, 0.8, 0.69).material(material.pbr().baseColor('#4c2c18').roughness(0.4).coat(1)))
  .add(shape.box(2.74, 0.1, 0.12).at(0, 0.8, -0.69).material(material.pbr().baseColor('#4c2c18').roughness(0.4).coat(1)))
  .light(light.spot().at(0, 1.9, 0).aim(0, 0.8, 0).power(u.lm(5000)).cone(u.deg(45)).softEdge(u.deg(15)).temperature(u.K(3200)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.06)))
  .light(light.env.uniform(u.nit(1)))
  .camera(camera.thinLens().at(-1.2, 1.25, 1.1).lookAt(0.15, 0.8, 0).focal(u.mm(45)).fstop(4));
