import { scene, shape, material, light, camera, mesh, hdri, finish, params, param, units as u } from 'candela';

// A slider-crank: a crank disc turns about z, a connecting rod follows its pin, a piston slides in a glass
// cylinder. The kinematics — the solver — is a JS function of time; it returns world poses per id.
const P = params({
  rpm: param.float(240).range(0, 1500).label('Crank speed (rpm)'),
  stroke: param.float(0.04).range(0.02, 0.05).step(0.005).static().label('Stroke (m)'),
});
const L = 0.11;                                     // rod length, pin to pin
const r = P.stroke.value / 2;                       // crank radius: half the stroke

// parts, made the way a CAD export would describe them
const crank = mesh.merge([
  { mesh: mesh.cylinder(0.042, 0.012, { name: 'web', segments: 96 }), at: [0, 0, 0], rotateX: Math.PI / 2 },
  { mesh: mesh.cylinder(0.007, 0.03, { name: 'pin' }), at: [0, r, 0.012], rotateX: Math.PI / 2, prefix: 'pin-' },
  { mesh: mesh.cylinder(0.01, 0.05, { name: 'main' }), at: [0, 0, -0.02], rotateX: Math.PI / 2, prefix: 'main-' },
], { name: 'crank', meta: { material: 'steel' } }).withFaceMeta(/^pin-/, { process: 'ground' });
const rod = mesh.merge([
  { mesh: mesh.box(0.012, L, 0.008, { name: 'beam' }), at: [0, L / 2, 0] },
  { mesh: mesh.tube(0.014, 0.0072, 0.01, { name: 'big end', segments: 48 }), at: [0, 0, 0], rotateX: Math.PI / 2, prefix: 'big-' },
  { mesh: mesh.tube(0.009, 0.0042, 0.01, { name: 'small end', segments: 48 }), at: [0, L, 0], rotateX: Math.PI / 2, prefix: 'small-' },
], { name: 'connecting rod', meta: { material: 'steel' } }).withFaceMeta(/^(left|right|front|back)$/, { process: 'forged' });
// a piston with two ring grooves: a revolved profile, each segment its own CAD face
const piston = mesh.revolve([[0, 0], [0.024, 0], [0.024, 0.022], [0.0225, 0.022], [0.0225, 0.025], [0.024, 0.025], [0.024, 0.029], [0.0225, 0.029], [0.0225, 0.032], [0.024, 0.032], [0.024, 0.036], [0, 0.036]],
  { name: 'piston', segments: 96, faces: ['crown-under', 'skirt', 'groove-1a', 'groove-1', 'groove-1b', 'land', 'groove-2a', 'groove-2', 'groove-2b', 'top-land', 'crown'], meta: { material: 'aluminium' } });
const bore = mesh.tube(0.0262, 0.0245, 0.1, { name: 'cylinder', segments: 96 });

// the solver: crank angle θ, pin at r(−sin θ, cos θ), piston pin on the axis, the rod between them
export const animation = t => {
  const th = P.rpm.value / 60 * 2 * Math.PI * t;
  const pin = [-r * Math.sin(th), r * Math.cos(th)];
  const yp = pin[1] + Math.sqrt(L * L - pin[0] * pin[0]);
  const psi = Math.atan2(pin[0], yp - pin[1]);      // the rod leans back toward the pin
  return {
    crank: { position: [0, 0, 0], rotation: [0, 0, th] },
    rod: { position: [pin[0], pin[1], 0.012], rotation: [0, 0, psi] },
    piston: { position: [0, yp - 0.012, 0.012], rotation: [0, 0, 0] },
  };
};
export default scene()
  .add(shape.mesh(crank).autoFinish().id('crank'))
  .add(shape.mesh(rod).autoFinish().id('rod'))
  .add(shape.mesh(piston).autoFinish().face('crown', finish.faced({ metal: 'aluminium' })).id('piston'))
  .add(shape.mesh(bore).material(material.glass({ roughness: 0.02 })).at(0, L + 0.015, 0.012))
  .add(shape.box(0.3, 0.02, 0.12).at(0, -0.075, 0).material(finish.paint('#33393f', { gloss: 0.3, roughness: 0.6 })))
  .add(shape.plane(6).at(0, -0.085, 0).material(material.pbr().baseColor(0.05).roughness(0.85)))
  .light(light.env.hdri(hdri.studio({ boxes: [{ az: -60, el: 25, w: 50, h: 40, L: 2500 }, { az: 100, el: 10, w: 12, h: 60, L: 1500 }, { az: 180, el: 40, w: 60, h: 14, L: 900 }] }), { luminance: u.nit(300) }))
  .camera(camera.thinLens().at(0.13, 0.11, 0.5).lookAt(0, 0.07, 0.01).focal(u.mm(35)).fstop(8).motionBlur({ angle: u.deg(180), fps: 24, steps: 12 }));
