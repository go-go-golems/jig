import { scene, shape, material, fragment, light, camera, fx, param, params, units as u } from 'candela';

const moss = fragment('moss')
  .targets('material.pbr')
  .requires('baseColor', 'roughness')
  .params({ moss: param.float(0).range(0, 1) })
  .around('roughness', (next, self, r) => next(typeof r === 'number' ? Math.max(r, 0.3) : r))   // moss never goes glossy
  .lower((m, f) => {
    const up = fx.pattern(p => p.N.y.smoothstep(0.2, 0.9));
    const n = fx.pattern(p => fx.noise.fbm(p.P.mul(6), { octaves: 5 }).add(0.5));
    const k = fx.smoothstep(f.moss.oneMinus(), f.moss.oneMinus().add(0.08), up.mul(n));
    return m.map('baseColor', c => fx.mix(c, fx.color('#3d5a1e'), k)).map('roughness', r => fx.mix(r, 0.95, k));
  });

const P = params({ moss: param.float(0.55).range(0, 1).label('Moss') });
const stone = material.pbr().baseColor('#8d877c').roughness(0.75).with(moss).moss(P.moss);

export default scene().params(P)
  .add(shape.roundedBox(1.2, 0.5, 0.8, 0.12).at(-0.5, 0.25, 0).material(stone))
  .add(shape.sphere(0.45).at(0.8, 0.45, 0.1).material(stone))
  .add(shape.roundedBox(0.5, 1.1, 0.5, 0.08).at(-0.2, 0.55, -0.9).material(stone))
  .add(shape.plane(30).material(material.pbr().baseColor('#5a4a38').roughness(0.95)))
  .light(light.daylight({ elevation: u.deg(55), azimuth: u.deg(120) }))
  .camera(camera.thinLens().at(0.4, 1.5, 3.4).lookAt(0, 0.4, -0.2).focal(u.mm(38)));
