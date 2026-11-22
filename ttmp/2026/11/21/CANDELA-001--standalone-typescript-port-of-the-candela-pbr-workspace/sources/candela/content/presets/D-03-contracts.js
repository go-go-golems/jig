import { scene, shape, material, light, camera, units as u } from 'candela';
import { rust, bokeh } from 'candela/fragments';

// material.metal('Fe').with(rust);            // E130
// light.spot().with(rust);                    // E131

const iron = material.pbr().baseColor('#7a7c80').metallic(1).roughness(0.35).with(rust).rust(0.5);

export default scene()
  .add(shape.cylinder(0.3, 1.0).at(0, 0.5, 0).material(iron))
  .add(shape.plane(30).material(material.pbr().baseColor(0.45)))
  .light(light.daylight({ elevation: u.deg(40) }))
  .camera(camera.thinLens().with(bokeh).blades(7).at(0, 1.1, 2.6).lookAt(0, 0.5, 0).focal(u.mm(50)).fstop(2.8));
