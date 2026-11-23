import { scene, shape, material, light, camera, mesh, hdri, finish, assets, params, param, units as u } from 'candela';

// Image-based light: an equirectangular HDRI around the scene, importance-sampled (an alias table over its
// texels), so a sun of a few hundred texels still lights the scene cleanly. Drop your own .hdr on the viewport.
const P = params({
  env: param.choice(['studio', 'outdoor', 'dropped .hdr'], 'studio').label('Environment'),
  turn: param.angle(u.deg(0)).range(u.deg(-180), u.deg(180)).label('Rotate the environment'),
});

let img = hdri.studio(), how = { luminance: u.nit(500) };
if (P.env.value === 'outdoor') { img = hdri.outdoor({ sunElevation: 32, sunAzimuth: 50 }); how = { intensity: 1 }; }      // absolute: ≈100 klx of sun
if (P.env.value === 'dropped .hdr') {
  const a = assets.list()[0];
  if (a) { img = a.name; how = { intensity: 1 }; } else console.log('No image yet: drop a Radiance .hdr on the viewport (or use Scene → Assets), then pick this again.');
}

const bearing = mesh.bearing({ outer: 0.09, inner: 0.04, width: 0.024, balls: 11 });
export default scene()
  .add(shape.sphere(0.05).at(-0.13, 0.05, 0).material(finish.polished('chrome')))
  .add(shape.sphere(0.05).at(0.13, 0.05, 0).material(material.pbr().baseColor(0.5).roughness(0.6)))
  .add(shape.mesh(bearing).autoFinish().at(0, 0.012, 0.02))
  .add(shape.cylinder(0.32, 0.02).at(0, -0.01, 0).material(material.pbr().baseColor(0.7).roughness(0.4)))
  .light(light.env.hdri(img, Object.assign({ rotate: P.turn }, how)))
  .camera(camera.thinLens().at(0, 0.16, 0.55).lookAt(0, 0.04, 0).focal(u.mm(50)).fstop(8));
