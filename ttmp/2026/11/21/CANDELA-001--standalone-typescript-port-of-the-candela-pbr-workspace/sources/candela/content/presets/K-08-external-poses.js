import { scene, shape, material, light, camera, mesh, hdri, finish, params, param, units as u } from 'candela';

// A three-axis arm: base, shoulder, upper arm, forearm, wrist and gripper, as nested groups with ids. The
// motion comes from outside: `animation` here is a stand-in for an animation engine — forward kinematics that
// returns a world matrix per link — and anything the page receives through workbench.setPoses or postMessage
// overrides it, id by id.
const P = params({ speed: param.float(1).range(0, 3).label('Speed') });

const L1 = 0.16, L2 = 0.13;
const tube = (len, r) => mesh.tube(r, r * 0.75, len, { name: `tube ${Math.round(len * 1000)}`, segments: 48 }).withMeta({ material: 'aluminium', finish: 'anodized', color: '#b8bcc2' });
const joint = r => mesh.cylinder(r, r * 1.6, { name: 'joint', segments: 64 }).withMeta({ material: 'steel', process: 'turned' });
const base = mesh.revolve([[0, 0], [0.07, 0], [0.07, 0.012], [0.05, 0.02], [0.035, 0.06], [0, 0.06]], { name: 'base', segments: 96, faces: ['under', 'rim', 'chamfer', 'cone', 'top'] }).withMeta({ material: 'cast-iron', finish: 'paint', color: '#c8501e' });

// local frames: each link points along +y from its joint
const link = (id, len, r, child) => scene.group([
  shape.mesh(joint(r * 1.25)).autoFinish().rotateZ(u.deg(90)),
  shape.mesh(tube(len, r)).autoFinish().at(0, len / 2, 0),
  ...(child ? [child.at(0, len, 0)] : []),
]).id(id);
const gripper = scene.group([
  shape.mesh(mesh.box(0.05, 0.01, 0.02, { name: 'palm' }).withMeta({ material: 'steel', finish: 'black-oxide' })).autoFinish().at(0, 0.005, 0),
  shape.mesh(mesh.box(0.008, 0.04, 0.016, { name: 'finger' }).withMeta({ material: 'steel', finish: 'black-oxide' })).autoFinish().at(-0.018, 0.03, 0).id('finger-l'),
  shape.mesh(mesh.box(0.008, 0.04, 0.016, { name: 'finger' }).withMeta({ material: 'steel', finish: 'black-oxide' })).autoFinish().at(0.018, 0.03, 0).id('finger-r'),
]).id('gripper');
const arm = scene.group([shape.mesh(base).autoFinish(), link('upper', L1, 0.016, link('fore', L2, 0.013, gripper)).at(0, 0.075, 0)]).id('turret');

// forward kinematics: the stand-in animation engine. Joint angles → a world pose for each link.
const R = (ax, a) => { const c = Math.cos(a), s = Math.sin(a); return ax === 'y' ? [[c, 0, s], [0, 1, 0], [-s, 0, c]] : [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const mul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const app = (A, v) => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const mat4 = (Rm, p) => [Rm[0][0], Rm[1][0], Rm[2][0], 0, Rm[0][1], Rm[1][1], Rm[2][1], 0, Rm[0][2], Rm[1][2], Rm[2][2], 0, p[0], p[1], p[2], 1];
export const animation = t => {
  const k = t * P.speed.value;
  const yaw = 0.9 * Math.sin(k * 0.7), sh = 0.55 + 0.35 * Math.sin(k * 1.1), el = 1.1 + 0.4 * Math.sin(k * 1.3 + 1), grip = 0.006 * (1 + Math.sin(k * 2));
  const R0 = R('y', yaw), R1 = mul(R0, R('x', sh)), R2 = mul(R1, R('x', el));
  const p1 = [0, 0.075, 0], p2 = p1.map((v, i) => v + app(R1, [0, L1, 0])[i]), p3 = p2.map((v, i) => v + app(R2, [0, L2, 0])[i]);
  return {                                         // 4×4 column-major matrices, as three.js or glTF would send
    turret: mat4(R0, [0, 0, 0]),
    upper: mat4(R1, p1),
    fore: mat4(R2, p2),
    gripper: mat4(R2, p3),
    'finger-l': { position: [-0.012 - grip, 0.03, 0], local: true },          // local: under the gripper
    'finger-r': { position: [0.012 + grip, 0.03, 0], local: true },
  };
};

export default scene()
  .add(arm)
  .add(shape.plane(6).material(material.pbr().baseColor(0.32).roughness(0.6)))
  .light(light.env.hdri(hdri.studio(), { luminance: u.nit(380) }))
  .camera(camera.thinLens().at(0.32, 0.28, 0.5).lookAt(0, 0.14, 0).focal(u.mm(40)).fstop(8).motionBlur({ angle: u.deg(180), fps: 24, steps: 6 }));
