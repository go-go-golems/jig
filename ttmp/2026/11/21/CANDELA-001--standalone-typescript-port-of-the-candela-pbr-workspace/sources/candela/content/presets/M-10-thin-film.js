import { scene, shape, material, light, camera, param, params, units as u } from 'candela';

const P = params({ film: param.float(320).range(0, 1200).label('Film (nm) on the big sphere') });
const thick = [100, 200, 300, 400, 550, 800];

export default scene().params(P)
  .add(thick.map((d, i) => shape.sphere(0.22).at((i - 2.5) * 0.52, 0.22, -0.6)
    .material(material.pbr().baseColor('#c0bab0').metallic(1).roughness(0.2).thinFilm(d))))
  .add(shape.sphere(0.45).at(-0.55, 0.45, 0.4).material(material.pbr().baseColor('#c0bab0').metallic(1).roughness(0.15).thinFilm(P.film)))
  .add(shape.sphere(0.4).at(0.6, 0.6, 0.5).material(material.soapFilm({ thickness: u.nm(400) })))
  .add(shape.plane(30).material(material.pbr().baseColor(0.06).roughness(0.4)))
  .light(light.env.studio({ intensity: u.nit(1000) }))
  .camera(camera.thinLens().at(0, 1.1, 3.2).lookAt(0, 0.35, 0).focal(u.mm(40)));
