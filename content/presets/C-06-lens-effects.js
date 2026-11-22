import { scene, shape, material, light, camera, engine as E, pass, param, params, units as u } from 'candela';

const P = params({
  bloom: param.float(0.4).range(0, 1).label('Bloom').static(),
  vignette: param.float(0.6).range(0, 1).label('Vignette').static(),
  grain: param.float(0.1).range(0, 1).label('Grain').static(),
});

export default scene().params(P)
  .add(scene.group(g => { for (let i = 0; i < 7; i++) g.add(shape.sphere(0.04).at((i - 3) * 0.35, 1.3, -1.2).material(material.emissive('#ffe0b0', u.nit(30000)))); }))
  .add(shape.roundedBox(0.8, 0.5, 0.5, 0.06).at(0, 0.25, 0).material(material.carPaint('#16305a')))
  .add(shape.plane(30).material(material.pbr().baseColor(0.15).roughness(0.3)))
  .light(light.env.gradient({ top: '#30384a', bottom: '#0a0a0a', intensity: u.nit(40) }))
  .camera(camera.thinLens().at(0, 0.7, 2.4).lookAt(0, 0.4, 0).focal(u.mm(40)));

export const engine = E.realtime().post(pass.tonemap('agx'), pass.bloom({ strength: P.bloom.value }), pass.vignette({ strength: P.vignette.value }), pass.grain({ amount: P.grain.value }));
