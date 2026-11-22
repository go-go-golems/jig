import { scene, shape, material, light, camera, fx, units as u } from 'candela';

const wood = p => fx.ramp(fx.noise.fbm(p.P.mul(fx.vec3(3, 3, 30)), { octaves: 4 }).mul(0.5).add(0.5), [[0, '#4a2a14'], [0.5, '#8a5a30'], [1, '#c08a50']]);
const base = material.pbr().baseColor(wood).roughness(0.8);
const v = [base, base.coat(1).coatRoughness(0.02), base.coat(1).coatRoughness(0.25), base.coat(1).coatRoughness(0.03).coatColor('#e0a040')];

export default scene()
  .add(v.map((m, i) => shape.roundedBox(0.6, 0.6, 0.6, 0.08).at((i - 1.5) * 0.85, 0.3, 0).rotateY(u.deg(20)).material(m)))
  .add(shape.plane(30).material(material.pbr().baseColor(0.35).roughness(0.7)))
  .light(light.env.studio({ intensity: u.nit(900) }))
  .camera(camera.thinLens().at(0, 1.4, 3.6).lookAt(0, 0.3, 0).focal(u.mm(42)));
