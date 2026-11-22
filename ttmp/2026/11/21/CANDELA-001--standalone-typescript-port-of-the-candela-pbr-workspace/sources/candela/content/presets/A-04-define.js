import { scene, shape, material, bsdf, light, camera, fx, param, params, units as u } from 'candela';

const tile = material.define('tile', {
  glaze: param.color('#2a6f8f'),
  grout: param.color('#d8d2c4'),
  tiles: param.float(6).range(1, 20),
  gap: param.float(0.06).range(0.01, 0.3),
}, m => {
  const g = fx.pattern(p => p.P.xz.mul(m.tiles).fract());
  const edge = fx.min(fx.min(g.x, g.y), fx.min(g.x.oneMinus(), g.y.oneMinus()));
  const mask = edge.smoothstep(m.gap.mul(0.5), m.gap.mul(0.5).add(0.01));
  const glazed = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.04 }), bsdf.lambert(m.glaze));
  return bsdf.mix(bsdf.lambert(m.grout), glazed, mask);
});

const P = params({ n: param.float(6).range(1, 16).label('Tiles per metre'), gap: param.float(0.06).range(0.01, 0.3).label('Grout') });

export default scene().params(P)
  .add(shape.plane(30).material(tile().tiles(P.n).gap(P.gap)))
  .add(shape.sphere(0.4).at(0, 0.4, 0).material(material.metal('Cu', { roughness: 0.15 })))
  .light(light.daylight({ elevation: u.deg(35), azimuth: u.deg(30) }))
  .camera(camera.thinLens().at(0, 1.3, 2.6).lookAt(0, 0.25, 0).focal(u.mm(35)));
