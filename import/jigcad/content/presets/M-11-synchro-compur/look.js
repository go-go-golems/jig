// look.js: how the Compur is rendered (materials, light, camera) as a Candela
// scene (JIG-016), and how it moves: one 1/125 release from the shutter's own
// dynamics, baked by tools/compur-poses.mjs into compur-poses.look.js.
// The Render view edits the chain under the marker: a material chosen for a
// face adds a .meta() line there.
import { scene, shape, light, camera, hdri, material, finish } from 'candela';
import { jigScene } from 'jig-candela';
import { program } from 'jig-program';
import poses from './compur-poses.look.js';

// true leaves out the front cover, the speed ring, the speed cam and the
// cocking ring and pinion, to show the mechanism at work under them
const CUTAWAY = false;
const FRONT = ['cover', 'speedRing', 'speedCam', 'cockingRing', 'pinion'];

const all = program;
const model = !CUTAWAY ? all : { ...all,
  components: all.components.filter((c) => !FRONT.includes(c.id)),
  bodies: all.bodies.filter((b) => !FRONT.includes(b.component)) };

const asm = jigScene(model, { autoFinish: true })
  // materials: the Render view adds lines here
  ;
// the camera: in front of the shutter, 50° above its plate and a little to the
// left (the optical axis is jig's Z, +Y here: the front faces up), a 100 mm
// lens framing the whole shutter
const B = asm.bounds(), target = asm.center(), deg = Math.PI / 180;
const r = Math.hypot(...[0, 1, 2].map((a) => B[1][a] - B[0][a])) / 2;
const el = 50 * deg, az = -20 * deg, focal = 0.1;
const d = (1.15 * r) / Math.sin(Math.atan(0.018 / focal));
const toward = [Math.cos(el) * Math.sin(az), Math.sin(el),
  Math.cos(el) * Math.cos(az)];
const eye = toward.map((c, a) => target[a] + d * c);
const floor = material.pbr().baseColor(0.18).roughness(0.8);
export default scene()
  .add(asm)
  .add(shape.plane().at(0, B[0][1], 0).material(floor).id('floor'))
  .add(light.env.hdri(hdri.studio(), { rotate: 30 }))
  .camera(camera.thinLens().at(eye).lookAt(target).focal(focal).fstop(8));

// the timeline: 0.5 s at rest, the release 250× slower (20 ms in 5 s), 1 s at
// rest; 6.5 s in all
export const animation = poses.animate(model);
