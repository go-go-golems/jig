// session.ts — the part of a running scene that is not the GPU: the clock, behaviours, animation poses and the `env`
// that `pack` turns into buffers (CANDELA-002 design doc 02, §5.2). The browser's Host and Viewport use the functions
// below (one implementation); SceneSession bundles them for hosts without a browser, such as candela-rt, where the
// scene's callbacks (animation(t), .behavior(), derived params) run in embedded V8.
import { build } from './candela';

export type Poses = Record<string, any> | Map<string, any> | null;
export type PoseSource = Poses | ((t: number) => Poses);

/** a behaviour's mutable state: position, rotation (radians, xyz), uniform scale; `pack` reads it as an override */
export interface BehaviorPose { pos: number[]; rot: number[]; scale: number | null }
export interface BehaviorState { anim: Map<string, BehaviorPose>; state: Record<string, any> }

/** poses at time t: the scene's `animation(t)`, then poses pushed from outside, which win (moved from Viewport.posesFor) */
export function posesAt(animation: ((t: number) => Poses) | null | undefined, external: PoseSource | undefined, t: number, onError?: (msg: string | null) => void): Poses {
  let P: any = null;
  if (animation) { try { P = animation(t); if (onError) onError(null); } catch (e: any) { if (onError) onError(e.message); } }
  if (external) {
    const X = typeof external === 'function' ? external(t) : external;
    const obj = (m: any) => (m instanceof Map ? Object.fromEntries(m) : m || {});
    P = Object.assign({}, obj(P), obj(X));
  }
  return P;
}

export interface MotionBlur { interval: number; steps: number }

/** the `env` for `compiled.pack` at time t (moved from Viewport.repack): behaviour overrides, poses, seed, and the
 *  scene at `steps` instants across the shutter, centred on t, when motion blur is on */
export function makePackEnv(posesFor: (t: number) => Poses, o: { time: number; overrides?: Map<string, BehaviorPose> | null; seed?: number; motion?: MotionBlur | null }): Record<string, any> {
  const time = o.time;
  const env: any = { time, overrides: o.overrides || null, poses: posesFor(time), seed: o.seed || 0 };
  const mb = o.motion;
  if (mb && mb.interval > 0 && mb.steps >= 2) {
    const K = mb.steps;
    env.motion = { samples: Array.from({ length: K }, (_, k) => { const tk = time + (k / (K - 1) - 0.5) * mb.interval; return { time: tk, poses: posesFor(tk) }; }) };
  }
  return env;
}

/** x/y/z access on a [x, y, z] array, for behaviours' self.position and self.rotation */
export const vecHandle = (a: number[]) => new Proxy(a, {
  get(t: any, k) { if (k === 'x') return t[0]; if (k === 'y') return t[1]; if (k === 'z') return t[2]; return t[k]; },
  set(t: any, k, v) { const i = ({ x: 0, y: 1, z: 2 } as any)[k]; if (i != null) t[i] = +v; else t[k] = v; return true; },
});

/** run every `.behavior((self, { t, dt, world, state }) => …)` once (moved from Host.runBehaviors). Returns true when
 *  any behaviour ran, i.e. the scene must be repacked with `st.anim` as overrides. */
export function stepBehaviors(behaviors: any[] | null | undefined, st: BehaviorState, o: { t: number; dt: number; world: any; onError?: (msg: string) => void }): boolean {
  let moved = false;
  for (const b of behaviors || []) {
    try {
      if (!b.id) { if (o.onError) o.onError('a .behavior() needs the node to have an .id()'); continue; }
      let s = st.anim.get(b.id);
      if (!s) { const at = (b.comp.props.at || [0, 0, 0]).map((v: any) => typeof v === 'number' ? v : +v || 0); s = { pos: at.slice(), rot: [0, 0, 0], scale: null }; st.anim.set(b.id, s); }
      const cur = s;
      const self = { position: vecHandle(cur.pos), rotation: vecHandle(cur.rot), get scale() { return cur.scale == null ? 1 : cur.scale; }, set scale(v: number) { cur.scale = +v; }, id: b.id };
      b.fn(self, { t: o.t, dt: o.dt, world: o.world, state: st.state });
      moved = true;
    } catch (e: any) { if (o.onError) o.onError('behavior: ' + e.message); }
  }
  return moved;
}

/** a scene with its clock, outside the browser: build, seek (behaviours step by dt), pack at the current time */
export class SceneSession {
  seed: number;
  result: any = null;
  compiled: any = null;
  time = 0;
  beh: BehaviorState = { anim: new Map(), state: {} };
  externalPoses: PoseSource = null;
  motionOverride: MotionBlur | null | undefined = undefined;
  poseError: string | null = null;
  errors: string[] = [];
  /** the `world` handed to behaviours; a browser host passes its live world, headless hosts a read-only one */
  world: any;

  constructor(o: { seed?: number; world?: any } = {}) {
    this.seed = o.seed || 0;
    this.world = o.world || { get time() { return 0; }, ids: () => [] };
  }

  async build(files: Record<string, string>, o: Record<string, any> = {}) {
    const r: any = await build(files, Object.assign({ seed: this.seed }, o));
    this.result = r;
    this.compiled = r.ok ? r.compiled : null;
    if (this.compiled) this.compiled.animation = r.animation || null;
    this.beh = { anim: new Map(), state: {} };
    this.time = 0;
    return r;
  }

  get behaviors(): any[] { return (this.compiled && this.compiled.behaviors) || []; }
  setPoses(p: PoseSource) { this.externalPoses = p || null; }
  posesFor(t: number): Poses { return posesAt(this.compiled && this.compiled.animation, this.externalPoses, t, m => { this.poseError = m; }); }

  /** move the clock to t (as Host.seek): seeking backwards with dt = 0 resets behaviour state; behaviours step by dt */
  seek(t: number, dt = 0): boolean {
    if (dt === 0 && t < this.time - 1e-9) this.beh = { anim: new Map(), state: {} };
    this.time = t;
    return this.behaviors.length ? stepBehaviors(this.behaviors, this.beh, { t, dt, world: this.world, onError: m => this.errors.push(m) }) : false;
  }

  /** the pack env at the current time (or `time`), with the session's behaviour overrides and seed */
  env(time = this.time, o: { seed?: number } = {}): Record<string, any> {
    if (!this.compiled) throw new Error('SceneSession.env: no scene is built');
    const motion = this.motionOverride !== undefined ? this.motionOverride : this.compiled.motionBlur;
    return makePackEnv(t => this.posesFor(t), { time, overrides: this.beh.anim, seed: o.seed ?? 0, motion });
  }

  pack(time = this.time, o: { seed?: number } = {}) { return this.compiled.pack(this.env(time, o)); }
}
