// window.FormSkateStage — the Form Skate stage's drafting code (app/draft.js, app/truth.js, src/lib/depth-order.js,
// the drawing parts of skate/board.js and skate/figure.js, core.js's maths) and the stage's call sequence. No React.
// Units: metres and radians in the world, CSS pixels on the sheet. Colours are read from the st-* tokens.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type ViewKey = 'axo' | 'front' | 'side' | 'plan';
/** A palette name or any CSS colour. */
export type Tone = 'ink' | 'muted' | 'accent' | 'red' | 'warn' | 'soft' | 'blue' | 'green' | 'violet' | 'amber' | 'teal' | 'ghost' | 'stage' | 'grid' | 'major' | 'shadow' | string;
export type OverlayKey = 'shadows' | 'trail' | 'annotations' | 'grid' | 'forces' | 'contacts' | 'rig' | 'sites' | 'course' | 'changes' | 'truth';

/** An elliptical section of a loft: c + a cos θ A + b sin θ B. */
export interface Station { c: Vec3; A: Vec3; B: Vec3; a: number; b: number; ring?: 0 | 1 }
export interface Pose { p: Vec3; q: Quat }
export interface Camera { c: Vec3; r: Vec3; u: Vec3; s: number; T: Vec3; W: number; H: number; yaw: number; pitch: number; Y0: number }
/** The drafting palette, read from the st-* tokens (readColors). */
export interface Colors { stage: string; grid: string; major: string; shadow: string; ink: string; muted: string; accent: string; red: string; warn: string; soft: string; blue: string; green: string; violet: string; amber: string; teal: string; ghost: string }

export interface LoftOptions { name?: string; tone?: Tone; fill?: 'soft'; meridian?: boolean; bias?: number; chain?: string; plane?: { n: Vec3; p0: Vec3; tol?: number; lean?: number } | null; under?: string; ghost?: number; noShadow?: boolean; after?: (d: DecalContext) => void }
export interface PolyOptions { name?: string; fill?: 'stage' | 'hatch' | 'soft' | 'none' | Tone; tone?: Tone; width?: number; stroke?: boolean; bias?: number; plane?: LoftOptions['plane']; under?: string }
export interface MarkOptions { tone?: Tone; width?: number; alpha?: number; dash?: number[] }
export interface LabelOptions extends MarkOptions { dx?: number; dy?: number; size?: number; align?: CanvasTextAlign; bg?: boolean; weight?: number }
export interface DecalContext { color(name: string): string; decal(frame: Pose, local: Vec3, normal: Vec3, size: number, mirror: number, draw: (ctx: CanvasRenderingContext2D) => void): boolean }

/** The drafting context `g`: views add marks in any order; flush draws them floor → shadows → ghost → figure (depth-sorted) → overlay. */
export declare class Draft {
  layer: 'floor' | 'ghost' | 'figure' | 'overlay';
  cam: Camera; C: Colors; truth: { wrongCm2: number; wrong: number; contested: number } | null; orderError: Error | null;
  begin(cam: Camera, C: Colors, o?: { overlays?: Set<OverlayKey>; span?: [number, number] | null; heightAt?: (x: number, z: number) => number; order?: Function | null; orderName?: string | null; chains?: boolean; truthKey?: string | null; now?: number }): void;
  on(name: OverlayKey): boolean;
  trailSpan(): [number, number] | null;
  loft(stations: Station[], o?: LoftOptions): void;
  poly(points: Vec3[], o?: PolyOptions): void;
  line(a: Vec3, b: Vec3, o?: MarkOptions): void;
  polyline(points: Vec3[], o?: MarkOptions & { closed?: boolean }): void;
  arrow(p: Vec3, v: Vec3, o?: MarkOptions): void;
  dot(p: Vec3, radiusPx?: number, o?: MarkOptions & { hollow?: boolean; normal?: Vec3 }): void;
  ring(p: Vec3, radiusM?: number, o?: MarkOptions): void;
  label(text: string | number, p: Vec3, o?: LabelOptions): void;
  dimension(a: Vec3, b: Vec3, text: string, o?: MarkOptions & { offset?: number }): void;
  grid(o?: { minor?: number; major?: number; extent?: number }): void;
  boundary(o?: { size?: number; band?: number }): void;
  tone(name: Tone): string;
  flush(ctx: CanvasRenderingContext2D): void;
  loftPath(stations: Station[], path?: Path2D): { path: Path2D; E: number[][][] };
  text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o?: { size?: number; w?: number; col?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline; bg?: string | null; mono?: boolean }): void;
}

export interface SheetOptions { view?: ViewKey; zoom?: number; scale?: number; yaw?: number; pitch?: number; target?: Vec3; pan?: [number, number]; overlays?: OverlayKey[]; order?: string | null; chains?: boolean; span?: [number, number]; heightAt?: (x: number, z: number) => number; width?: number; height?: number; colorsFrom?: Element; truthKey?: string | null }
export interface Sheet { cam: Camera; C: Colors; ctx: CanvasRenderingContext2D; g: Draft; W: number; H: number; view: ViewKey;
  /** Clear to st-bg, let fn add marks, flush them, then the furniture. Returns g. */
  draw(fn: (g: Draft, cam: Camera) => void, furniture?: { scaleBar?: boolean; titleBlock?: { rows: [string, string][]; sheet?: string } }): Draft }

export interface FigurePose { F: { W: Quat[]; P: Vec3[] }; s: object; hip: Vec3; feet: { front: Pose; rear: Pose } }

export interface FormSkateStage {
  VIEWS: Record<ViewKey, { name: string; short: string; yaw: number; pitch: number }>;
  makeCam(yaw: number, pitch: number, pxPerMetre: number, target: Vec3, W: number, H: number): Camera;
  proj(cam: Camera, p: Vec3): [number, number];
  depth(cam: Camera, p: Vec3): number;
  unprojectFloor(cam: Camera, x: number, y: number, h?: number): Vec3 | null;
  hull2(points: [number, number][]): [number, number][];
  readColors(el?: Element): Colors;
  SUN: Vec3;
  Draft: typeof Draft;
  titleBlock(ctx: CanvasRenderingContext2D, g: Draft, cam: Camera, rows: [string, string][], sheet?: string): void;
  scaleBar(ctx: CanvasRenderingContext2D, g: Draft, cam: Camera): void;
  solidItems(marks: object[], cam: Camera): object[];
  overlapKit(cam: Camera): { overlaps(a: object, b: object): boolean; depth(p: Vec3): number };
  orderItems(items: object[], cam: Camera, fn: Function | null, mem: object): { order: object[]; error: Error | null };
  /** truth.js: rasterize, truthOf, misdrawn, oracleRank, topoRank, unitOf, unitOrder, chainRanks */
  truth: Record<string, Function>;
  /** depth-order.js: strategies, current ('deck plane'), describe, planeVerdict, coherent, anchored, byKey */
  depthOrder: { strategies: Record<string, Function>; current: string; describe: Record<string, string>; planeVerdict: Function; coherent: Function; anchored: Function; byKey: Function };
  /** board.js drawing: DECK (dimensions in metres), kickY, kickSlope, halfWidth, gripAt, sectionsOfDeck, drawBoard */
  board: Record<string, any>;
  /** figure.js: HJOINTS, J, PARTS, STICK, CH, HALF, fk, toW, newPose, legIK, armIK, limitJoint, postureFor, buildPose, drawFace */
  figure: Record<string, any>;
  V: Record<string, Function>; Q: Record<string, Function>; spring: { step(s: { x: number; v: number }, goal: number, halfLife: number, dt: number): number };
  OVERLAYS: [OverlayKey, string, string][]; ORDER_TOGGLES: [OverlayKey, string, string][]; DEFAULT_OVERLAYS: OverlayKey[];
  /** Pixels per metre at zoom 1: min(W, H)/7.5 in plan, min(W/5.5, H/3.1) otherwise. */
  baseScale(view: ViewKey, W: number, H: number): number;
  sheet(canvas: HTMLCanvasElement, o?: SheetOptions): Sheet;
  /** Call fn 30 ms after the theme changes (data-theme or the system scheme). Returns a stop function. */
  onTheme(fn: () => void): () => void;
  deckPose(p?: Vec3, q?: Quat): Pose;
  deckSites(pose: Pose, dims?: object): { name: string; p: Vec3 }[];
  drawSites(g: Draft, pose: Pose, dims?: object): void;
  drawBoard(g: Draft, pose: Pose, dims?: object, o?: { ghost?: number; roll?: number }): void;
  figurePose(o?: { deck?: Pose; crouch?: number; lean?: number; pushing?: boolean; phase?: 'ride' | 'air' | 'bail'; heading?: number; stanceFront?: number; stanceRear?: number; standHeight?: number; hip?: Vec3 }): FigurePose;
  drawFigure(g: Draft, pose: FigurePose): void;
  drawTrail(g: Draft, samples: { t: number; p: Vec3; q: Quat }[], dims?: object): void;
  drawChrono(g: Draft, samples: { t: number; hip: Vec3; ff: Vec3; rf: Vec3; deck: Pose }[], every?: number): void;
}
declare global { interface Window { FormSkateStage: FormSkateStage } }
