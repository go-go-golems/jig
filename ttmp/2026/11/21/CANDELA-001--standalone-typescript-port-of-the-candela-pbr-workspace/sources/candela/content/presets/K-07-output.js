import { scene, shape, material, light, camera, mesh, hdri, finish, params, param, units as u } from 'candela';

// A turntable for output: an assembly that turns once every `period` seconds. Open the Render view to render a
// still, the full turn as a frame sequence, or EXRs with beauty, albedo, normal, depth and id passes.
const P = params({ period: param.float(8).range(2, 30).label('One turn (s)') });

const gear = mesh.gear({ teeth: 40, module: 0.002, width: 0.012, bore: 0.012, name: 'gear z40 m2' }).withMeta({ material: 'steel' });
const pinion = mesh.gear({ teeth: 14, module: 0.002, width: 0.016, bore: 0.004, name: 'pinion z14 m2' }).withMeta({ material: 'brass' });
const bearing = mesh.bearing({ outer: 0.032, inner: 0.012, width: 0.01, balls: 8 });
const hub = mesh.shaft([[0.004, 0.02], [0.012, 0.012], [0.014, 0.006]], { name: 'hub', segments: 96 }).withMeta({ material: 'aluminium', finish: 'anodized', color: '#7a1f2b' });

const assembly = scene.group([
  shape.mesh(gear).autoFinish().at(0, 0.006, 0),
  shape.mesh(hub).autoFinish().at(0, -0.004, 0),
  shape.mesh(bearing).autoFinish().at(0, 0.017, 0),
  // the pinion meshes with the gear: a gap of its own where the gear has a tooth on the line of centres
  shape.mesh(pinion).autoFinish().at(0.054, 0.008, 0).rotateY(Math.PI / 14 - Math.PI),
]).id('assembly');

export const animation = t => ({ assembly: { position: [0, 0.008, 0], rotation: [0, (t / P.period.value) * Math.PI * 2, 0] } });

export default scene()
  .add(assembly)
  .add(shape.cylinder(0.12, 0.004).at(0, 0.002, 0).material(material.pbr().baseColor(0.06).roughness(0.35)))
  .add(shape.plane(6).material(material.pbr().baseColor(0.72).roughness(0.9)))
  .add(shape.cylinder(1.2, 4).at(0, 1.2, -1.4).rotateZ(u.deg(90)).material(material.pbr().baseColor(0.72).roughness(0.9)))
  .light(light.env.hdri(hdri.studio(), { luminance: u.nit(450) }))
  .camera(camera.thinLens().at(0, 0.11, 0.24).lookAt(0, 0.012, 0).focal(u.mm(60)).fstop(11));
