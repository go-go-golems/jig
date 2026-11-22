import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({
  N: param.float(1.8).range(1.2, 22).scale('log').label('f-number'),
  focus: param.length(2.6).range(0.8, 8).label('Focus (m)'),
});

const pawn = c => scene.group([
  shape.cylinder(0.12, 0.05).at(0, 0.025, 0),
  shape.cone(0.09, 0.3).at(0, 0.2, 0),
  shape.sphere(0.07).at(0, 0.38, 0),
].map(s => s.material(material.pbr().baseColor(c).roughness(0.3).coat(1))));

export default scene().params(P)
  .add([0, 1, 2, 3, 4].map(i => pawn(i % 2 ? '#e8e0d0' : '#3a322c').at(-0.4 + i * 0.25, 0, 1 - i * 1.1)))
  .add(shape.plane(40).material(material.pbr().baseColor(0.3).roughness(0.5)))
  .light(light.env.studio({ intensity: u.nit(800), rotate: u.deg(-30) }))
  .camera(camera.thinLens().at(-0.6, 0.5, 3.6).lookAt(0.2, 0.2, -1).focal(u.mm(85)).fstop(P.N).focus(P.focus));
