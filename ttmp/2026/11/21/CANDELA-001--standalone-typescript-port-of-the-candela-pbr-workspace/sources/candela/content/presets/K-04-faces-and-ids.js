import { scene, shape, material, light, camera, mesh, hdri, finish, params, param, units as u } from 'candela';

// An output shaft assembly: a stepped shaft, a gear on it, a bearing at each end, a nut. Materials are bound to
// CAD faces three ways: from metadata (autoFinish), by selector (.face(…)), or by a function of each face.
const P = params({ show: param.choice(['finishes', 'faces', 'parts'], 'finishes').label('Colour by') });

// the shaft: each diameter is a turned face d0…d4, the steps are faced shoulders; journals d0 and d4 are ground
const shaft = mesh.shaft([[0.014, 0.0075], [0.006, 0.0095], [0.05, 0.0085], [0.006, 0.0095], [0.014, 0.0075]], { name: 'output shaft', segments: 96 })
  .withMeta({ material: 'steel', drawing: 'OS-1042 rev C' })
  .withFaceMeta(['d0', 'd4'], { process: 'ground', tolerance: 'k6' });
const gear = mesh.gear({ teeth: 26, module: 0.0025, width: 0.016, bore: 0.0085, name: 'gear z26 m2.5' }).withMeta({ material: 'steel', heatTreat: 'case hardened' });
const bearing = mesh.bearing({ outer: 0.032, inner: 0.015, width: 0.009, balls: 9 });
const nut = mesh.nut({ d: 0.017, acrossFlats: 0.024, height: 0.008 });

// a colour per face id, or per part: stable hashes, so the same face keeps its colour
const hue = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 360) / 360; };
const hsl = (h, s = 0.55, l = 0.5) => { const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)].map(c => c ** 2.2); };
const dress = (s, part) => P.show.value === 'faces' ? s.autoFinish((meta, f) => material.diffuse(hsl(hue(part + f.id))))
  : P.show.value === 'parts' ? s.material(material.diffuse(hsl(hue(part), 0.6, 0.55)))
  : s.autoFinish();

const lay = s => s.rotateZ(u.deg(90));             // the assembly lies along x
const y = 0.04;
export default scene()
  // a selector binding wins over metadata: the shaft's body is a coarser turn than its journals
  .add(lay((P.show.value === 'finishes' ? dress(shape.mesh(shaft), 'shaft').face('d2', finish.turned().roughness(0.38)) : dress(shape.mesh(shaft), 'shaft')).at(0.045, y, 0)).id('shaft'))
  .add(lay(dress(shape.mesh(gear), 'gear').at(0.0, y, 0)).id('gear'))
  .add(lay(dress(shape.mesh(bearing), 'bearing-a').at(-0.038, y, 0)).id('bearing-a'))
  .add(lay(dress(shape.mesh(bearing), 'bearing-b').at(0.038, y, 0)).id('bearing-b'))
  .add(lay(dress(shape.mesh(nut), 'nut').at(0.012, y, 0)).id('nut'))
  .add(shape.plane(4).material(material.pbr().baseColor(0.2).roughness(0.7)))
  .light(light.env.hdri(hdri.studio(), { luminance: u.nit(350) }))
  .camera(camera.thinLens().at(0.06, 0.11, 0.17).lookAt(0, 0.036, 0).focal(u.mm(50)).fstop(11));
