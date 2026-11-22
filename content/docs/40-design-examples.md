---
id: design-examples
title: The design, by example (L0–L18)
group: Design
about: the specification this workbench grew from: nineteen examples, simple to complex
order: 40
---
# The design, by example

> **Note.** This is the specification the workbench was built from. Most of it runs here — try the presets — but a few examples describe things this workbench does not do: meshes from files, differentiable rendering (L17), and the agent *session* API of L16 (here the agent is the chat in the Agent view, using the same grammar through `eval`).


Each level adds one idea. From L1 on, assume:

```js
import candela, {
  scene, shape, material, bsdf, ior, light, medium, phase, camera, engine, integrator, pass,
  fx, param, params, fragment, lift, ui, units as u,
} from 'candela';
```

---

### L0 — Hello, sphere

```js
import { scene, shape, material, light, camera, units as u } from 'candela';

const s = scene()
  .add(shape.sphere(1)
    .material(material.pbr().baseColor('#c8553d').roughness(0.4)))
  .add(shape.plane(20).at(0, -1, 0)
    .material(material.pbr().baseColor(0.18)))                 // an 18 % grey card
  .light(light.daylight({ elevation: u.deg(40), turbidity: 3 }))  // sun + physical sky
  .camera(camera.thinLens().at(0, 0.6, 5).lookAt(0, 0, 0));

await s.render('#view');   // compile and run with a device-appropriate default engine
```

**Points to notice**

- Every call returns a **new immutable builder**, so `s` is a value you can pass around.
- `'#c8553d'` is an sRGB-*encoded* hex value and is decoded to linear. A bare `0.18` is a linear reflectance.
- Anything you did not specify gets a physically plausible default, and **defaults are announced** rather than silent:

```js
console.log(s.explain());
```

```text
scene#7f3a · 5 nodes · 0 params · units: SI, photometric
├─ camera   thinLens 50 mm · f/8 · 1/125 s · ISO 100            ⓘ default lens, sensor 36×24 mm
│           exposure: auto → metered from scene                  ⓘ set .exposure(ev) to lock it
├─ light    daylight  sun 40° · turbidity 3 → sun + sky
├─ node     sphere r=1     material.pbr  (base #c8553d, roughness 0.4)
├─ node     plane 20×20    material.pbr  (base 0.18)
└─ engine   auto → realtime (WebGPU available) · tone map AgX · display sRGB
```

---

### L1 — Builders are values; the IR comes free

```js
const plastic = material.pbr().roughness(0.35);
const red  = plastic.baseColor('#b3261e');
const blue = plastic.baseColor('#1e4bb3');
// `plastic` is unchanged. `red` and `blue` share every IR node except the colour constant.

const ball = shape.sphere(0.5);
const s = scene()
  .add(ball.material(red).at(-0.6, 0, 0))
  .add(ball.material(blue).at(0.6, 0, 0));   // same geometry node → instanced automatically

console.log(red.ir().print());
console.log(red.ir({ optimize: true }).print());
```

```text
material.pbr#a91c   (sugar → lowered)
mix  t = metallic = 0
├─ layer  coupling = fresnel
│  ├─ dielectric        f0 = 0.08 · specular = 0.04    α = 0.35² = 0.1225
│  └─ lambert           ρ = srgb(#b3261e) → linear(0.451, 0.019, 0.013)
└─ conductor.schlick    F0 = ρ (shared node)           α = 0.1225 (shared node)

after optimise: mix(t = 0) folded → layer(dielectric, lambert)        nodes 7 → 4
```

The IR is a **DAG, not a tree**. Equal sub-expressions are hash-consed into one node, which gives structural sharing between builders, automatic instancing and cache keys at no extra cost:

```diagram
<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 671.75px; background-color: transparent;" viewBox="0 0 671.75 463.5" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;fill:#000000;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#552222;}#my-svg .error-text{fill:#552222;stroke:#552222;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#737373;stroke:#737373;}#my-svg .marker.cross{stroke:#737373;}#my-svg svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;}#my-svg p{margin:0;}#my-svg .label{font-family:Arial,Helvetica,sans-serif;color:#000000;}#my-svg .cluster-label text{fill:#333;}#my-svg .cluster-label span{color:#333;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#000000;color:#000000;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#eee;stroke:#999;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#737373!important;stroke-width:0;stroke:#737373;}#my-svg .arrowheadPath{fill:#333333;}#my-svg .edgePath .path{stroke:#737373;stroke-width:1px;}#my-svg .flowchart-link{stroke:#737373;fill:none;}#my-svg .edgeLabel{background-color:white;text-align:center;}#my-svg .edgeLabel p{background-color:white;}#my-svg .edgeLabel rect{opacity:0.5;background-color:white;fill:white;}#my-svg .labelBkg{background-color:rgba(255, 255, 255, 0.5);}#my-svg .cluster rect{fill:hsl(0, 0%, 98.9215686275%);stroke:#707070;stroke-width:1px;}#my-svg .cluster text{fill:#333;}#my-svg .cluster span{color:#333;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:hsl(-160, 0%, 93.3333333333%);border:1px solid #707070;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#000000;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:white;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:white;padding:2px;}#my-svg .icon-shape .label rect,#my-svg .image-shape .label rect{opacity:0.5;background-color:white;fill:white;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg .node .neo-node{stroke:#999;}#my-svg [data-look="neo"].node rect,#my-svg [data-look="neo"].cluster rect,#my-svg [data-look="neo"].node polygon{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].swimlane.cluster rect{filter:none;}#my-svg [data-look="neo"].node path{stroke:url(#my-svg-gradient);stroke-width:1px;}#my-svg [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node .neo-line path{stroke:#999;filter:none;}#my-svg [data-look="neo"].node circle{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node circle .state-start{fill:#000000;}#my-svg [data-look="neo"].icon-shape .icon{fill:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].icon-shape .icon-neo path{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointEnd-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5;"/></marker><marker id="my-svg_flowchart-v2-crossStart-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M340.57,57.5L340.57,61.667C340.57,65.833,340.57,74.167,340.57,81.833C340.57,89.5,340.57,96.5,340.57,100L340.57,103.5" id="my-svg-L_R_MR_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_R_MR_0" data-points="W3sieCI6MzQwLjU3MDMxMjUsInkiOjU3LjV9LHsieCI6MzQwLjU3MDMxMjUsInkiOjgyLjV9LHsieCI6MzQwLjU3MDMxMjUsInkiOjEwNy41fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M522.109,57.5L522.109,61.667C522.109,65.833,522.109,74.167,522.109,81.833C522.109,89.5,522.109,96.5,522.109,100L522.109,103.5" id="my-svg-L_B_MB_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_MB_0" data-points="W3sieCI6NTIyLjEwOTM3NSwieSI6NTcuNX0seyJ4Ijo1MjIuMTA5Mzc1LCJ5Ijo4Mi41fSx7IngiOjUyMi4xMDkzNzUsInkiOjEwNy41fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M300.461,150.93L289.342,156.109C278.224,161.287,255.987,171.643,244.868,180.322C233.75,189,233.75,196,233.75,199.5L233.75,203" id="my-svg-L_MR_LR_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_MR_LR_0" data-points="W3sieCI6MzAwLjQ2MDkzNzUsInkiOjE1MC45MzAzNTU0NDUwMzc2Nn0seyJ4IjoyMzMuNzUsInkiOjE4Mn0seyJ4IjoyMzMuNzUsInkiOjIwN31d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M482,152.052L471.89,157.043C461.78,162.035,441.56,172.017,431.45,180.509C421.34,189,421.34,196,421.34,199.5L421.34,203" id="my-svg-L_MB_LB_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_MB_LB_0" data-points="W3sieCI6NDgyLCJ5IjoxNTIuMDUyMDMxMjQzOTQzMX0seyJ4Ijo0MjEuMzM5ODQzNzUsInkiOjE4Mn0seyJ4Ijo0MjEuMzM5ODQzNzUsInkiOjIwN31d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M189.656,249.247L176.109,254.622C162.563,259.998,135.469,270.749,122.628,279.638C109.787,288.526,111.2,295.552,111.906,299.065L112.612,302.578" id="my-svg-L_LR_D_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_LR_D_0" data-points="W3sieCI6MTg5LjY1NjI1LCJ5IjoyNDkuMjQ2ODIyMDMzODk4M30seyJ4IjoxMDguMzc1LCJ5IjoyODEuNX0seyJ4IjoxMTMuNDAwMTI1NjI4MTQwNywieSI6MzA2LjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M377.246,242.088L349.229,248.657C321.212,255.225,265.178,268.363,230.144,278.778C195.109,289.192,181.074,296.885,174.057,300.731L167.039,304.577" id="my-svg-L_LB_D_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_LB_D_0" data-points="W3sieCI6Mzc3LjI0NjA5Mzc1LCJ5IjoyNDIuMDg3OTQ3NzkyNzkxMTR9LHsieCI6MjA5LjE0NDUzMTI1LCJ5IjoyODEuNX0seyJ4IjoxNjMuNTMxNzAxNDc2MTMwNjUsInkiOjMwNi41fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M277.844,250.763L289.724,255.886C301.604,261.009,325.365,271.254,337.245,279.877C349.125,288.5,349.125,295.5,349.125,299L349.125,302.5" id="my-svg-L_LR_CR_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_LR_CR_0" data-points="W3sieCI6Mjc3Ljg0Mzc1LCJ5IjoyNTAuNzYzMzM5NjUzMzA0NDZ9LHsieCI6MzQ5LjEyNSwieSI6MjgxLjV9LHsieCI6MzQ5LjEyNSwieSI6MzA2LjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M465.434,249.816L478.322,255.097C491.211,260.377,516.988,270.939,529.877,279.719C542.766,288.5,542.766,295.5,542.766,299L542.766,302.5" id="my-svg-L_LB_CB_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_LB_CB_0" data-points="W3sieCI6NDY1LjQzMzU5Mzc1LCJ5IjoyNDkuODE1ODgzODY2ODE2OH0seyJ4Ijo1NDIuNzY1NjI1LCJ5IjoyODEuNX0seyJ4Ijo1NDIuNzY1NjI1LCJ5IjozMDYuNX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M380.68,144.033L402.219,150.361C423.759,156.689,466.839,169.344,495.396,179.518C523.953,189.692,537.988,197.385,545.006,201.231L552.023,205.077" id="my-svg-L_MR_K_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_MR_K_0" data-points="W3sieCI6MzgwLjY3OTY4NzUsInkiOjE0NC4wMzMxMDYxMjg3NTY5NH0seyJ4Ijo1MDkuOTE3OTY4NzUsInkiOjE4Mn0seyJ4Ijo1NTUuNTMwNzk4NTIzODY5MywieSI6MjA3fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M562.219,154.777L570.297,159.315C578.375,163.852,594.531,172.926,601.903,180.976C609.275,189.026,607.863,196.052,607.157,199.565L606.451,203.078" id="my-svg-L_MB_K_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_MB_K_0" data-points="W3sieCI6NTYyLjIxODc1LCJ5IjoxNTQuNzc3NDczOTgxMzAxODJ9LHsieCI6NjEwLjY4NzUsInkiOjE4Mn0seyJ4Ijo2MDUuNjYyMzc0MzcxODU5MywieSI6MjA3fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M118.375,356L118.375,360.167C118.375,364.333,118.375,372.667,118.375,380.333C118.375,388,118.375,395,118.375,398.5L118.375,402" id="my-svg-L_D_A_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_D_A_0" data-points="W3sieCI6MTE4LjM3NSwieSI6MzU2fSx7IngiOjExOC4zNzUsInkiOjM4MX0seyJ4IjoxMTguMzc1LCJ5Ijo0MDZ9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel"><g class="label" data-id="L_R_MR_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_B_MB_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_MR_LR_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_MB_LB_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_LR_D_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_LB_D_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_LR_CR_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_LB_CB_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_MR_K_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_MB_K_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_D_A_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="my-svg-flowchart-R-0" data-look="classic" transform="translate(340.5703125, 32.75)"><rect class="basic label-container" style="" x="-64.3203125" y="-24.75" width="128.640625" height="49.5"/><g class="label" style="" transform="translate(-34.3203125, -9.75)"><rect/><foreignObject width="68.640625" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>material red</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-MR-1" data-look="classic" transform="translate(340.5703125, 132.25)"><rect class="basic label-container" style="" x="-40.109375" y="-24.75" width="80.21875" height="49.5"/><g class="label" style="" transform="translate(-10.109375, -9.75)"><rect/><foreignObject width="20.21875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>mix</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-B-2" data-look="classic" transform="translate(522.109375, 32.75)"><rect class="basic label-container" style="" x="-67.21875" y="-24.75" width="134.4375" height="49.5"/><g class="label" style="" transform="translate(-37.21875, -9.75)"><rect/><foreignObject width="74.4375" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>material blue</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-MB-3" data-look="classic" transform="translate(522.109375, 132.25)"><rect class="basic label-container" style="" x="-40.109375" y="-24.75" width="80.21875" height="49.5"/><g class="label" style="" transform="translate(-10.109375, -9.75)"><rect/><foreignObject width="20.21875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>mix</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-LR-5" data-look="classic" transform="translate(233.75, 231.75)"><rect class="basic label-container" style="" x="-44.09375" y="-24.75" width="88.1875" height="49.5"/><g class="label" style="" transform="translate(-14.09375, -9.75)"><rect/><foreignObject width="28.1875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>layer</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-LB-7" data-look="classic" transform="translate(421.33984375, 231.75)"><rect class="basic label-container" style="" x="-44.09375" y="-24.75" width="88.1875" height="49.5"/><g class="label" style="" transform="translate(-14.09375, -9.75)"><rect/><foreignObject width="28.1875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>layer</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-D-9" data-look="classic" transform="translate(118.375, 331.25)"><rect class="basic label-container" style="" x="-110.375" y="-24.75" width="220.75" height="49.5"/><g class="label" style="" transform="translate(-80.375, -9.75)"><rect/><foreignObject width="160.75" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>dielectric f0=0.04, α=0.1225</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-CR-13" data-look="classic" transform="translate(349.125, 331.25)"><rect class="basic label-container" style="" x="-70.375" y="-24.75" width="140.75" height="49.5"/><g class="label" style="" transform="translate(-40.375, -9.75)"><rect/><foreignObject width="80.75" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>lambert ρ=red</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-CB-15" data-look="classic" transform="translate(542.765625, 331.25)"><rect class="basic label-container" style="" x="-73.265625" y="-24.75" width="146.53125" height="49.5"/><g class="label" style="" transform="translate(-43.265625, -9.75)"><rect/><foreignObject width="86.53125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>lambert ρ=blue</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-K-17" data-look="classic" transform="translate(600.6875, 231.75)"><rect class="basic label-container" style="" x="-63.0625" y="-24.75" width="126.125" height="49.5"/><g class="label" style="" transform="translate(-33.0625, -9.75)"><rect/><foreignObject width="66.125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>metallic = 0</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-A-21" data-look="classic" transform="translate(118.375, 430.75)"><rect class="basic label-container" style="" x="-61.046875" y="-24.75" width="122.09375" height="49.5"/><g class="label" style="" transform="translate(-31.046875, -9.75)"><rect/><foreignObject width="62.09375" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>α = 0.1225</p></span></div></foreignObject></g></g></g></g></g><defs><filter id="my-svg-drop-shadow" height="130%" width="130%"><feDropShadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><defs><filter id="my-svg-drop-shadow-small" height="150%" width="150%"><feDropShadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><linearGradient id="my-svg-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="hsl(0, 0%, 83.3333333333%)" stop-opacity="1"/><stop offset="100%" stop-color="hsl(0, 0%, 88.9215686275%)" stop-opacity="1"/></linearGradient></svg>
```

---

### L2 — Diagnostics: the proxies at work

Each line below is a separate mistake:

```js
material.pbr().roughnes(0.4);                 // typo
material.pbr().roughness(1.4);                // out of range
material.pbr().baseColor(1.0);                // a perfect white reflector does not exist
light.point().intensity(u.lm(800));           // wrong unit for the quantity
material.glass({ ior: 0.67 });                // relative IOR < 1 with no interface declared
camera.thinLens().fstop(0.4);                 // impossible lens in air
```

```text
✖ E104  material.pbr().roughnes(…)                                    scene.js:1:16
        'roughnes' is not an attribute of Material<pbr>. Did you mean 'roughness'?
        attributes: baseColor metallic roughness specular coat coatRoughness normal emission …

✖ E121  material.pbr().roughness(1.4)                                 scene.js:2:16
        roughness ∈ [0, 1] (perceptual; α = roughness²). Got 1.4.

⚠ W330  material.pbr().baseColor(1.0)                                 scene.js:3:16
        albedo 1.00 is outside the measured range of real materials [0.03 charcoal … 0.90 fresh snow].
        A perfect reflector makes indirect light converge slowly and look flat. Use ≤ 0.9, or .unchecked().

✖ E120  light.point().intensity(800 lm)                               scene.js:4:15
        intensity expects luminous intensity [cd = lm/sr]; got luminous flux [lm].
        → .power(u.lm(800))           (isotropic: I = Φ/4π = 63.66 cd)
        → .intensity(u.cd(63.66))

⚠ W340  material.glass({ ior: 0.67 })                                 scene.js:5:10
        ior < 1 describes a *relative* index (e.g. glass→water). Declare the outside medium:
        → material.glass({ ior: 1.5 }).exterior(medium.water())       (relative 1.5/1.33 = 1.13)

✖ E123  camera.thinLens().fstop(0.4)                                  scene.js:6:19
        N ≥ 0.5 for any lens in air (Abbe sine condition: N = 1 / (2 n sin θ_max)).
```

Errors surface **as early as possible**. Argument errors throw immediately, with a stack pointing at your code. Problems that span several nodes, such as energy conservation or a missing backend lowering, are collected at compile time and still point back to the builder call that created the node, because every node records its `loc`.

```js
const report = s.check();              // never throws: { errors, warnings, infos }
report.warnings.map(w => w.code);      // → ['W330']

candela.config({ diagnostics: 'strict' });   // warnings become errors (CI)
material.pbr().baseColor(1.0).unchecked();   // explicit opt-out, recorded in the IR
```

---

### L3 — Light in real units, the camera as an instrument

**Outdoors.** Photometric units with real-world magnitudes:

```js
const outdoor = scene({ units: 'photometric' })
  .add(shape.mesh('statue.glb').material(material.pbr().baseColor(0.55).roughness(0.6)))
  .light(light.sun().elevation(u.deg(55)).azimuth(u.deg(140)).illuminance(u.lux(100_000)))
  .light(light.sky.physical().fromSun())      // sky radiance consistent with the sun above
  .camera(camera.thinLens().focal(u.mm(35)).fstop(16).shutter(1 / 125).iso(100));   // "sunny 16"

outdoor.camera().ev100;    // → 14.97     log₂(16² · 125) − log₂(100/100)
outdoor.camera().lMax;     // → 38 400 nit  (1.2 · 2^14.97 = 1.2 · 32 000): scene luminance that just clips
```

**Indoors.** Each emitter is specified in the quantity that is natural for it, and the API converts using the emitter's geometry:

```js
const bulb = light.point().power(u.lm(800)).temperature(u.K(2700));   // ≈ 60 W incandescent equivalent
bulb.intensity();        // → 63.66 cd        Φ / 4π

const spot = light.spot().power(u.lm(1200)).cone(u.deg(20)).softEdge(u.deg(4));
spot.intensity();        // → 3167 cd         Φ / 2π(1 − cos 20°): the reflector focuses the flux
spot.powerMode('masked').intensity();   // → 95.5 cd   a point light with a mask: flux outside the cone is lost

const panel = shape.rect(1, 0.5).emit(light.area().power(u.lm(3000)).temperature(u.K(4000)));
panel.emission().luminance();   // → 1909.9 nit   Φ / πA, one-sided Lambertian

const interior = scene()
  .add(shape.mesh('room.glb'), panel.at(0, 2.6, 0).rotateX(u.deg(90)), bulb.at(1, 2.2, 0))
  .camera(camera.thinLens().focal(u.mm(24)).fstop(2.8).shutter(1 / 60).iso(800));   // EV100 = 5.88
```

**The camera as an instrument.** Once a scene is running you can take readings like a gaffer with a light meter:

```js
const world = await engine.preview().run(interior);

world.meter.incident({ at: [0, 0.75, 0], normal: [0, 1, 0] });   // → lux on the desk
world.meter.reflected('#painting');                              // → nit, plus EV100 = log₂(L · S / K), K = 12.5
interior.camera().exposure('meter:#painting');                   // lock exposure to the reading
```

```text
✖ E120  light.sun().power(100000 lm)
        a directional emitter has no finite power (it is infinitely distant).
        Specify illuminance at normal incidence: .illuminance(u.lux(100_000)).
```

---

### L4 — Parameters and sliders

Params are **typed, unit-aware DAG leaves**. Use them anywhere a value is accepted. Changing one does not change the graph's topology, so dragging a slider costs a uniform write rather than a recompile.

```js
import { param, params, ui } from 'candela';

const P = params({
  sun:   param.angle(u.deg(35)).range(u.deg(-6), u.deg(90)).label('Sun elevation'),
  paint: param.color('#b01818').role('reflectance'),
  gloss: param.float(0.65).range(0, 1).step(0.01),
  bulb:  param.lumen(800).range(0, 3000).scale('log'),
  cct:   param.kelvin(2700).range(1800, 6500),          // the UI draws a blackbody gradient
  ev:    param.ev(14).range(-2, 18),
  coat:  param.bool(true).static(),                     // specialisation constant
  look:  param.choice(['studio', 'dusk', 'night']).static(),
});

// Stage ③ host map: runs on the CPU only when `sun` changes, and feeds a uniform.
// Kasten–Young air mass + Meinel attenuation: a decent first-order model of direct sunlight.
function directNormalLux(elevation) {
  const e = elevation.deg;
  if (e <= 0) return 0;
  const z = 90 - e;
  const airMass = 1 / (Math.cos(z * Math.PI / 180) + 0.50572 * (96.07995 - z) ** -1.6364);
  return 128_000 * 0.7 ** (airMass ** 0.678);   // ≈ 89.6 klx at zenith, 72.4 at 30°, 52.9 at 15°, 22.6 at 5°
}

const s = scene().params(P)
  .add(shape.mesh('car.glb').material(material.pbr()
    .baseColor(P.paint)
    .roughness(P.gloss.map(g => 1 - g))                // host map: cheap
    .coat(P.coat.select(1, 0))))                       // static: false ⇒ no coat code is emitted at all
  .add(light.point().id('lamp').power(P.bulb).temperature(P.cct).at(0, 2.5, 0))
  .light(light.sun().elevation(P.sun).illuminance(P.sun.map(directNormalLux)))
  .light(light.sky.physical().fromSun())
  .camera(camera.thinLens().exposure(P.ev));

ui.panel(P, {
  groups: { Sun: ['sun'], Car: ['paint', 'gloss', 'coat'], Interior: ['bulb', 'cct'], Camera: ['ev', 'look'] },
}).mount('#controls');

P.bindURL();                      // ?sun=35deg&paint=%23b01818&…  shareable state
const preset = P.snapshot();      // JSON with units
P.load(preset);
```

**Dynamic versus static params.** This is the same distinction as uniforms versus specialisation constants:

```diagram
<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 1262.33px; background-color: transparent;" viewBox="0 0 1262.328125 248.38671875" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;fill:#000000;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#552222;}#my-svg .error-text{fill:#552222;stroke:#552222;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#737373;stroke:#737373;}#my-svg .marker.cross{stroke:#737373;}#my-svg svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;}#my-svg p{margin:0;}#my-svg .label{font-family:Arial,Helvetica,sans-serif;color:#000000;}#my-svg .cluster-label text{fill:#333;}#my-svg .cluster-label span{color:#333;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#000000;color:#000000;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#eee;stroke:#999;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#737373!important;stroke-width:0;stroke:#737373;}#my-svg .arrowheadPath{fill:#333333;}#my-svg .edgePath .path{stroke:#737373;stroke-width:1px;}#my-svg .flowchart-link{stroke:#737373;fill:none;}#my-svg .edgeLabel{background-color:white;text-align:center;}#my-svg .edgeLabel p{background-color:white;}#my-svg .edgeLabel rect{opacity:0.5;background-color:white;fill:white;}#my-svg .labelBkg{background-color:rgba(255, 255, 255, 0.5);}#my-svg .cluster rect{fill:hsl(0, 0%, 98.9215686275%);stroke:#707070;stroke-width:1px;}#my-svg .cluster text{fill:#333;}#my-svg .cluster span{color:#333;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:hsl(-160, 0%, 93.3333333333%);border:1px solid #707070;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#000000;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:white;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:white;padding:2px;}#my-svg .icon-shape .label rect,#my-svg .image-shape .label rect{opacity:0.5;background-color:white;fill:white;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg .node .neo-node{stroke:#999;}#my-svg [data-look="neo"].node rect,#my-svg [data-look="neo"].cluster rect,#my-svg [data-look="neo"].node polygon{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].swimlane.cluster rect{filter:none;}#my-svg [data-look="neo"].node path{stroke:url(#my-svg-gradient);stroke-width:1px;}#my-svg [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node .neo-line path{stroke:#999;filter:none;}#my-svg [data-look="neo"].node circle{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node circle .state-start{fill:#000000;}#my-svg [data-look="neo"].icon-shape .icon{fill:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].icon-shape .icon-neo path{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointEnd-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5;"/></marker><marker id="my-svg_flowchart-v2-crossStart-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M141.703,107.125L145.87,107.125C150.036,107.125,158.37,107.125,166.036,107.125C173.703,107.125,180.703,107.125,184.203,107.125L187.703,107.125" id="my-svg-L_A_B_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_A_B_0" data-points="W3sieCI6MTQxLjcwMzEyNSwieSI6MTA3LjEyNX0seyJ4IjoxNjYuNzAzMTI1LCJ5IjoxMDcuMTI1fSx7IngiOjE5MS43MDMxMjUsInkiOjEwNy4xMjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M287.038,81.413L298.019,73.302C308.999,65.192,330.961,48.971,360.89,40.86C390.82,32.75,428.719,32.75,466.315,32.75C503.911,32.75,541.206,32.75,568.833,32.75C596.461,32.75,614.422,32.75,623.402,32.75L632.383,32.75" id="my-svg-L_B_C_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_C_0" data-points="W3sieCI6Mjg3LjAzNzg2OTgyOTA4NjUsInkiOjgxLjQxMjg2OTgyOTA4NjUzfSx7IngiOjM1Mi45MjE4NzUsInkiOjMyLjc1fSx7IngiOjQ2Ni42MTcxODc1LCJ5IjozMi43NX0seyJ4Ijo1NzguNSwieSI6MzIuNzV9LHsieCI6NjM2LjM4MjgxMjUsInkiOjMyLjc1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M794.648,32.75L802.069,32.75C809.49,32.75,824.331,32.75,835.251,32.75C846.172,32.75,853.172,32.75,856.672,32.75L860.172,32.75" id="my-svg-L_C_D_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_C_D_0" data-points="W3sieCI6Nzk0LjY0ODQzNzUsInkiOjMyLjc1fSx7IngiOjgzOS4xNzE4NzUsInkiOjMyLjc1fSx7IngiOjg2NC4xNzE4NzUsInkiOjMyLjc1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M1035.203,32.75L1039.37,32.75C1043.536,32.75,1051.87,32.75,1065.275,39.021C1078.68,45.293,1097.157,57.836,1106.395,64.107L1115.634,70.378" id="my-svg-L_D_E_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_D_E_0" data-points="W3sieCI6MTAzNS4yMDMxMjUsInkiOjMyLjc1fSx7IngiOjEwNjAuMjAzMTI1LCJ5IjozMi43NX0seyJ4IjoxMTE4Ljk0MzM1NjA5MjQzNywieSI6NzIuNjI1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M290.357,129.518L300.784,135.642C311.212,141.766,332.067,154.014,348.523,160.138C364.979,166.262,377.036,166.262,383.065,166.262L389.094,166.262" id="my-svg-L_B_F_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_F_0" data-points="W3sieCI6MjkwLjM1Njc1NzA4NTk5MTE1LCJ5IjoxMjkuNTE4MjQyOTE0MDA4ODV9LHsieCI6MzUyLjkyMTg3NSwieSI6MTY2LjI2MTcxODc1fSx7IngiOjM5My4wOTM3NSwieSI6MTY2LjI2MTcxODc1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M520.911,147.033L530.51,143.633C540.108,140.234,559.304,133.435,591.738,130.036C624.172,126.637,669.844,126.637,713.289,126.637C756.734,126.637,797.953,126.637,824.849,128.891C851.746,131.145,864.32,135.653,870.607,137.908L876.894,140.162" id="my-svg-L_F_G_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_F_G_0" data-points="W3sieCI6NTIwLjkxMTQ3NjU5NTkzNjcsInkiOjE0Ny4wMzI1NzAzNDU5MzY2OH0seyJ4Ijo1NzguNSwieSI6MTI2LjYzNjcxODc1fSx7IngiOjcxNS41MTU2MjUsInkiOjEyNi42MzY3MTg3NX0seyJ4Ijo4MzkuMTcxODc1LCJ5IjoxMjYuNjM2NzE4NzV9LHsieCI6ODgwLjY1ODgxMzA5MTQ4MjcsInkiOjE0MS41MTE3MTg3NX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M1019.078,166.262L1025.932,166.262C1032.786,166.262,1046.495,166.262,1060.37,162.472C1074.245,158.683,1088.286,151.104,1095.307,147.314L1102.328,143.525" id="my-svg-L_G_E_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_G_E_0" data-points="W3sieCI6MTAxOS4wNzgxMjUsInkiOjE2Ni4yNjE3MTg3NX0seyJ4IjoxMDYwLjIwMzEyNSwieSI6MTY2LjI2MTcxODc1fSx7IngiOjExMDUuODQ3NTMyNjU1NzIzNiwieSI6MTQxLjYyNX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M520.911,185.491L530.51,188.89C540.108,192.289,559.304,199.088,574.628,202.487C589.953,205.887,601.406,205.887,607.133,205.887L612.859,205.887" id="my-svg-L_F_H_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_F_H_0" data-points="W3sieCI6NTIwLjkxMTQ3NjU5NTkzNjcsInkiOjE4NS40OTA4NjcxNTQwNjMzMn0seyJ4Ijo1NzguNSwieSI6MjA1Ljg4NjcxODc1fSx7IngiOjYxNi44NTkzNzUsInkiOjIwNS44ODY3MTg3NX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M814.172,205.887L818.339,205.887C822.505,205.887,830.839,205.887,841.292,203.633C851.746,201.378,864.32,196.87,870.607,194.616L876.894,192.362" id="my-svg-L_H_G_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_H_G_0" data-points="W3sieCI6ODE0LjE3MTg3NSwieSI6MjA1Ljg4NjcxODc1fSx7IngiOjgzOS4xNzE4NzUsInkiOjIwNS44ODY3MTg3NX0seyJ4Ijo4ODAuNjU4ODEzMDkxNDgyNywieSI6MTkxLjAxMTcxODc1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel"><g class="label" data-id="L_A_B_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(466.6171875, 32.75)"><g class="label" data-id="L_B_C_0" transform="translate(-24.2109375, -9.75)"><foreignObject width="48.421875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>dynamic</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_C_D_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_D_E_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(352.921875, 166.26171875)"><g class="label" data-id="L_B_F_0" transform="translate(-15.171875, -9.75)"><foreignObject width="30.34375" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>static</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(715.515625, 126.63671875)"><g class="label" data-id="L_F_G_0" transform="translate(-6.8671875, -9.75)"><foreignObject width="13.734375" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>hit</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_G_E_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(578.5, 205.88671875)"><g class="label" data-id="L_F_H_0" transform="translate(-13.359375, -9.75)"><foreignObject width="26.71875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>miss</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_H_G_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="my-svg-flowchart-A-0" data-look="classic" transform="translate(74.8515625, 107.125)"><rect class="basic label-container" style="" x="-66.8515625" y="-24.75" width="133.703125" height="49.5"/><g class="label" style="" transform="translate(-36.8515625, -9.75)"><rect/><foreignObject width="73.703125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>slider moved</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-B-1" data-look="classic" transform="translate(252.2265625, 107.125)"><polygon points="60.5234375,0 121.046875,-60.5234375 60.5234375,-121.046875 0,-60.5234375" class="label-container" transform="translate(-60.0234375, 60.5234375)"/><g class="label" style="" transform="translate(-35.7734375, -9.75)"><rect/><foreignObject width="71.546875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>param kind?</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-C-3" data-look="classic" transform="translate(715.515625, 32.75)"><rect class="basic label-container" style="" x="-79.1328125" y="-24.75" width="158.265625" height="49.5"/><g class="label" style="" transform="translate(-49.1328125, -9.75)"><rect/><foreignObject width="98.265625" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>host maps re-run</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-D-4" data-look="classic" transform="translate(949.6875, 32.75)"><rect class="basic label-container" style="" x="-85.515625" y="-24.75" width="171.03125" height="49.5"/><g class="label" style="" transform="translate(-55.515625, -9.75)"><rect/><foreignObject width="111.03125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>uniform buffer write</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-E-5" data-look="classic" transform="translate(1169.765625, 107.125)"><rect class="basic label-container" style="" x="-84.5625" y="-34.5" width="169.125" height="69"/><g class="label" style="" transform="translate(-54.5625, -19.5)"><rect/><foreignObject width="109.125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>reset accumulation<br />next frame</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-F-7" data-look="classic" transform="translate(466.6171875, 166.26171875)"><polygon points="73.5234375,0 147.046875,-73.5234375 73.5234375,-147.046875 0,-73.5234375" class="label-container" transform="translate(-73.0234375, 73.5234375)"/><g class="label" style="" transform="translate(-39.0234375, -19.5)"><rect/><foreignObject width="78.046875" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>kernel variant<br />in cache?</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-G-9" data-look="classic" transform="translate(949.6875, 166.26171875)"><rect class="basic label-container" style="" x="-69.390625" y="-24.75" width="138.78125" height="49.5"/><g class="label" style="" transform="translate(-39.390625, -9.75)"><rect/><foreignObject width="78.78125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>swap pipeline</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-H-12" data-look="classic" transform="translate(715.515625, 205.88671875)"><rect class="basic label-container" style="" x="-98.65625" y="-34.5" width="197.3125" height="69"/><g class="label" style="" transform="translate(-68.65625, -19.5)"><rect/><foreignObject width="137.3125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>compile in background,<br />keep showing old frame</p></span></div></foreignObject></g></g></g></g></g><defs><filter id="my-svg-drop-shadow" height="130%" width="130%"><feDropShadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><defs><filter id="my-svg-drop-shadow-small" height="150%" width="150%"><feDropShadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><linearGradient id="my-svg-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="hsl(0, 0%, 83.3333333333%)" stop-opacity="1"/><stop offset="100%" stop-color="hsl(0, 0%, 88.9215686275%)" stop-opacity="1"/></linearGradient></svg>
```

> **Truthiness trap.** `.coat(P.coat ? 1 : 0)` would *always* pick `1`, because a param handle is an object and proxies cannot intercept truthiness. Use `P.coat.select(1, 0)`. The lint rule `candela/no-param-truthiness` catches this.

---

### L5 — Patterns: traced lambdas and staging

A **pattern** is a field over the shading context. Its lambda is called **once**, with symbolic proxies. Every operation records a node, and the result is type-checked and compiled into the shader.

```js
import { fx } from 'candela';

const tiles = fx.pattern(p => {
  const cell = p.uv.mul(8).floor();
  const odd  = cell.x.add(cell.y).mod(2);                       // 0 or 1, symbolic
  return fx.mix(fx.color('#e8e4da'), fx.color('#2b2b2b'), odd);
});

const grime = fx.pattern(p =>
  fx.noise.fbm(p.P.mul(3), { octaves: 5 }).smoothstep(0.45, 0.75));

const floor = material.pbr()
  .baseColor(tiles.mul(grime.oneMinus().mul(0.35).add(0.65)))  // grime darkens by up to 35 %
  .roughness(fx.mix(0.12, 0.7, grime));                         // fields compose like values
```

**Inline lambdas** work wherever a field is accepted. The context exposes `P, N, Ng, uv, wo, lambda, time, instance, curvature`, and swizzles come from the proxy (`p.P.xz`, `c.rgb`, `v.zyx`):

```js
const snow = fx.color(0.85), rock = fx.color('#5a5550');

const alpine = material.pbr()
  .baseColor(p => fx.mix(rock, snow, p.N.y.smoothstep(0.6, 0.8).mul(p.P.y.gt(1200).select(1, 0))))
  .roughness(p => fx.noise.perlin(p.P.xz.mul(0.05)).remap(-1, 1, 0.5, 0.9));
```

**Staging: JS is the macro language.** Below, `octaves`, `gain` and `ridged` are compile-time constants. The `for` loop unrolls and the `if` specialises; no branch reaches the shader:

```js
const terrainNoise = ({ octaves = 6, lacunarity = 2, gain = 0.5, ridged = false } = {}) =>
  fx.pattern(p => {
    let sum = fx.float(0), amp = 0.5, freq = 1;
    for (let i = 0; i < octaves; i++) {               // unrolled at trace time
      let n = fx.noise.perlin(p.P.mul(freq));
      if (ridged) n = n.abs().oneMinus().pow(2);      // compile-time branch
      sum = sum.add(n.mul(amp));                      // `let` rebinding = SSA for free
      amp *= gain;                                    // plain JS arithmetic on plain JS numbers
      freq *= lacunarity;
    }
    return sum;
  });

const mountains = terrainNoise({ octaves: 8, ridged: true });   // a different kernel from terrainNoise()
```

**Stage errors.** The symbolic proxy traps `Symbol.toPrimitive`, so any attempt to treat a symbol as a JS number fails loudly and explains why:

```js
fx.pattern(p => Math.sin(p.uv.x * 10));
fx.pattern(p => (p.N.y > 0.7 ? snow : rock));
```

```text
✖ E201  symbolic Float used as a JS number (operator `*`)              terrain.js:1:33
        `p.uv.x` exists only when the shader runs; JS arithmetic happens now, at trace time.
        → p.uv.x.mul(10).sin()

✖ E202  cannot branch on a symbolic Bool with `?:` / `if` / `>`         terrain.js:2:20
        → fx.select(p.N.y.gt(0.7), snow, rock)                          (hard edge)
        → fx.mix(rock, snow, p.N.y.smoothstep(0.65, 0.75))              (anti-aliased)
```

**Textures carry colour spaces and roles.** Getting these wrong is the most common PBR bug, so they are part of the type:

```js
const bricks = {
  albedo: fx.texture('bricks/albedo.jpg', { colorSpace: 'srgb', role: 'reflectance' }),
  rough:  fx.texture('bricks/rough.png',  { colorSpace: 'linear' }).r,
  normal: fx.normalMap('bricks/normal.png', { convention: 'opengl' }),   // +Y green; 'directx' flips it
  height: fx.texture('bricks/height.exr').r,
};

const wall = material.pbr()
  .baseColor(bricks.albedo).roughness(bricks.rough).normal(bricks.normal)
  .displace(bricks.height.mul(u.mm(8)));
```

```text
⚠ W310  roughness fed from a texture decoded as 'srgb'                  wall.js:3:11
        roughness is a linear quantity; sRGB decoding skews it toward smooth (0.5 → 0.21).
```

**Host lambdas inside shading** (stage ③ per sample) exist for debugging on the CPU reference backend only:

```js
const debug = material.pbr().baseColor(fx.host(ctx => (ctx.uv[0] < 0.5 ? [1, 0, 0] : [0, 0, 1])));
// engine.cpu()      → runs: real JS per shading point (~1000× slower; fine for a 64×64 probe)
// engine.realtime() → ✖ E710 fx.host has no WebGPU lowering; use fx.pattern
```

---

### L6 — The scattering algebra

**Leaves** are physical models; **combinators** preserve validity (see Part I §3).

```js
import { bsdf, ior } from 'candela';

const clay    = bsdf.lambert(0.45);
const glass   = bsdf.dielectric({ ior: 1.5, roughness: 0 });
const gold    = bsdf.conductor({ ior: ior.metal('Au') });                   // spectral η + ik, measured
const brushed = bsdf.conductor({ ior: ior.metal('Al'), roughness: [0.35, 0.08] });   // anisotropic αx, αy
const velvet  = bsdf.sheen({ color: '#5b1a3a', roughness: 0.4 });

const lacquered = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: 0.05 }), bsdf.lambert('#204080'));
const dustyGold = bsdf.mix(gold, clay, 0.2);
const sofa      = material(bsdf.layer(velvet, bsdf.lambert('#3a0f24')));
```

**A deep example: car paint.** A clear coat over a mix of pigment and randomly oriented metallic flakes:

```js
const flakeNormal = fx.pattern(p => {
  const cell = fx.noise.voronoi(p.P.mul(4000));                  // ≈ 0.25 mm cells
  return p.N.add(cell.randomVec3.sub(0.5).mul(0.5)).normalize(); // per-flake tilt
});

export const carPaint = (pigment, { flakes = 0.3, coatRoughness = 0.02 } = {}) =>
  bsdf.layer(
    bsdf.dielectric({ ior: 1.5, roughness: coatRoughness }),     // clear coat
    bsdf.mix(
      bsdf.lambert(pigment),
      bsdf.conductor({ ior: ior.metal('Al'), roughness: 0.3 }).normal(flakeNormal),
      flakes),
    { thickness: u.um(40), tint: '#fffaf0' });                    // σa = −ln(tint) / thickness

const body = material(carPaint('#7a0c12', { flakes: 0.25 }));
```

```text
              ωo               ωi
               ↖              ↗                 top: dielectric (η = 1.5, α = 0.02² = 0.0004)
  ─────────────●──────────────●──────────────   reflects F(θ); transmits (1 − F(θ))
   clear coat  │  T = exp(−σa d (1/μo′ + 1/μi′))       ← μ′: cosines after refraction; tint sets σa
  ─────────────●──────────────●──────────────
   base        mix( lambert(pigment), Al flakes with tilted normals, 0.25 )
```

**Materials are definitions, not primitives.** The standard `material.pbr` is eight lines of the algebra. `material.define` turns each param into a fluent method, a slider and an attribute that fragments can `map`:

```js
export const pbr = material.define('pbr', {
  baseColor:     param.color(0.8).role('reflectance'),
  metallic:      param.float(0).range(0, 1),
  roughness:     param.float(0.5).range(0, 1),
  specular:      param.float(0.5).range(0, 1),            // dielectric F0 = 0.08 · specular → 0.04 by default
  coat:          param.float(0).range(0, 1),
  coatRoughness: param.float(0.03).range(0, 1),
}, (m) => {
  const base = bsdf.mix(
    bsdf.layer(bsdf.dielectric({ f0: m.specular.mul(0.08), roughness: m.roughness }), bsdf.lambert(m.baseColor)),
    bsdf.conductor.schlick({ f0: m.baseColor, roughness: m.roughness }),
    m.metallic);
  const coated = bsdf.layer(bsdf.dielectric({ ior: 1.5, roughness: m.coatRoughness }), base);
  return bsdf.mix(base, coated, m.coat);                  // `base` appears twice → one shared DAG node
});

pbr().baseColor('#888').metallic(1).roughness(0.2).coat(1);
```

**Energy is checked where construction cannot guarantee it:**

```js
const tooBright = bsdf.add(bsdf.lambert(0.8), bsdf.conductor.schlick({ f0: 0.9, roughness: 0.2 }));
```

```text
⚠ W420  bsdf.add(…) is not energy-conserving: directional albedo ρ(0°) ≈ 1.70 > 1
        → bsdf.mix(a, b, t)           convex: always valid
        → bsdf.layer(b, a)            Fresnel-coupled: physically motivated
        → bsdf.add(…).normalize()     rescale by 1/max ρ(θ)
```

---

### L7 — Physical tests as code

The furnace test comes from renderer engineering: put an object inside a uniform white environment. A lossless material should then be **invisible**, because every direction returns radiance 1. Any visible darkening is energy the model loses.

```js
import { test } from 'candela/test';

const r = await test.furnace.sweep(
  rough => bsdf.conductor.schlick({ f0: 1, roughness: rough }),
  { roughness: [0.25, 0.5, 0.75, 1], angles: u.deg([0, 45, 75, 85]), spp: 1 << 20 });

console.table(r.albedo);
```

```text
white furnace · conductor F0 = 1 · GGX + height-correlated Smith · single scattering
roughness   θo = 0°    45°      75°      85°
0.25        0.996      0.993    0.964    0.892
0.50        0.916      0.887    0.840    0.902
0.75        0.627      0.636    0.741    0.862
1.00        0.307      0.377    0.592    0.781     ← exact value at 0°, α = 1:  1 − ln 2 = 0.3069

⚠ W421  up to 69 % of energy lost: light that bounces between microfacets more than once is
        missing. Rough metals will render too dark.  → .multiscatter('kulla-conty')
```

These numbers are real. They were computed by Monte Carlo and cross-checked against the closed form at `α = 1`, where `D = 1/π` and `E(μ=1) = ∫₀¹ c/(1+c) dc = 1 − ln 2`.

```js
const fixed = rough => bsdf.conductor.schlick({ f0: 1, roughness: rough }).multiscatter('kulla-conty');
await test.furnace.sweep(fixed, { roughness: [0.25, 0.5, 0.75, 1] });   // ✓ 1.000 within table precision

await test.reciprocity(carPaint('#a00'), { pairs: 10_000 });   // max |f(ωi,ωo) − f(ωo,ωi)| / f
await test.positivity(sofa.surface());
await test.colorChecker({ illuminant: 'D65', engine: 'reference', tolerance: { deltaE2000: 1.0 } });
await test.furnace.scene(s, { expect: 'lossless-invisible' });  // whole-scene variant: replaces lights with a white env
```

> **Why the scene-level test matters.** Normal maps and shading normals break reciprocity and energy conservation, as Veach showed. The scene test catches assets that "glow" in the furnace.

Run them in CI: `npx candela test 'scenes/**/*.scene.js'`.

---

### L8 — Build-time generators

Generator lambdas run **once, eagerly**, and produce structure. The classic PBR validation chart has metallic in the rows and roughness in the columns:

```js
const chart = scene.group(g => {
  for (let row = 0; row < 7; row++)          // metallic 0 → 1
    for (let col = 0; col < 7; col++)        // roughness 0 → 1
      g.add(shape.sphere(0.4)
        .at((col - 3) * 1.0, (3 - row) * 1.0, 0)
        .material(material.pbr().baseColor('#d4a017').metallic(row / 6).roughness(col / 6))
        .tag('swatch'));
});
```

```text
ⓘ I205  chart: 49 instances → 1 geometry (sphere r=0.4, hash-shared)
        49 materials → 1 kernel + 49 rows of (metallic, roughness) constants   [structural hash ignores literals]
⚠ W335  metallic ∈ {0.17 … 0.83}: partially metallic surfaces are non-physical outside texel
        boundaries. Fine for a chart; silence with .tag('chart') or .unchecked('W335').
```

The compiler hashes structure *without literal values*. Forty-nine materials that differ only in constants therefore become **one shader plus a constant table**. Generators can be naive and still produce efficient output.

**Scattering.** The `density` pattern is a *traced* lambda, evaluated **on the CPU at build time** to drive sampling (stage polymorphism). `place` is a build lambda that receives a seeded `rng`:

```js
const [grassA, grassB, clover] = await shape.meshes('flora.glb', ['grassA', 'grassB', 'clover']);
const terrain = shape.heightfield(mountains, { size: u.m(4000), resolution: 2048 });

const meadow = scene.scatter({
  on: terrain,
  count: 200_000,
  seed: 7,
  density: fx.pattern(p => p.N.y.smoothstep(0.85, 0.95).mul(p.P.y.lt(1800).select(1, 0))),
  place: (i, { rng, P, N }) =>
    rng.pick([grassA, grassB, clover], [0.6, 0.3, 0.1])
      .at(P).alignTo(N, { blend: 0.6 })
      .rotateY(rng.angle()).scale(rng.range(0.7, 1.3)),
});
```

**Determinism is enforced**, because a content-addressed IR is only useful if the same code produces the same hash:

```js
const rock = shape.mesh('rock.glb');
scene.group(g => g.add(rock.at(Math.random() * 10, 0, 0)));
```

```text
⚠ W501  Math.random() called inside a build lambda                      rocks.js:2:32
        Its values depend on every earlier Math.random() call in the build, so edits elsewhere change this part of the scene.
        → scene.group((g, { rng }) => g.add(rock.at(rng.range(0, 10), 0, 0)))
```

---

### L9 — Fragments: extending components

**Using fragments.** `.with()` adds methods and attributes to a single builder and everything derived from it:

```js
import { ies, weathering, bokeh } from 'candela/fragments';

const downlight = light.spot().power(u.lm(900)).with(ies('fixtures/downlight-36deg.ies'));
const bench     = shape.mesh('bench.glb').material(material.pbr().with(weathering).wear(0.4).dust(0.2));
const portrait  = camera.thinLens().with(bokeh).blades(7).bladeCurvature(0.3).fstop(1.8);
```

**Writing a fragment.** This one adds attributes and sliders (`params`), build-time sugar (`methods`), a trace-stage IR rewrite (`lower`) and a new diagnostic (`validate`):

```js
import { fragment, lift } from 'candela';

export const weathering = fragment('weathering')
  .targets('material')
  .requires('baseColor', 'roughness', 'metallic')        // attribute contract → E130 if missing
  .params({
    wear:      param.float(0).range(0, 1).label('Edge wear'),
    dust:      param.float(0).range(0, 1).label('Dust'),
    dustColor: param.color('#9a8f7f').role('reflectance'),
  })
  .methods({
    // stage ①: `years` may be a number or a param, so lift() it and map on the host
    aged(self, years) {
      const y = lift(years);
      return self.wear(y.map(v => Math.min(1, v / 25))).dust(y.map(v => Math.min(1, v / 8)));
    },
  })
  .lower((m, f) => {                                     // stage ②: rewrite the material's attributes
    const edges  = fx.curvature().smoothstep(0.2, 0.6).mul(f.wear);
    const upness = fx.pattern(p => p.N.dot(fx.vec3(0, 1, 0)).smoothstep(0.3, 0.9)).mul(f.dust);
    return m
      .map('baseColor', c => fx.mix(c, f.dustColor, upness))
      .map('roughness', r => fx.mix(r, 0.85, fx.max(edges, upness)))
      .map('metallic',  k => k.mul(upness.oneMinus()));
  })
  .validate((m, f, report) => {
    if (m.attr('emission').nonZero() && f.dust.nonZero())
      report.warn('W351', 'dust does not attenuate emission; add .map("emission", e => e.mul(upness.oneMinus()))');
  });
```

**Extending an existing method** with around-advice. This makes every material in the project enforce plausible albedo:

```js
import candela from 'candela';

export const plausibleAlbedo = fragment('plausible-albedo')
  .targets('material', 'bsdf.lambert')
  .around('baseColor', (next, self, color) => {
    const c = fx.color(color);                             // a constant or a field
    self.check(fx.luminance(c).between(0.03, 0.9), {       // constant → checked now; field → debug AOV
      code: 'W330',
      message: v => `albedo luminance ${v.toFixed(2)} is outside [0.03 charcoal … 0.90 fresh snow]`,
    });
    return next(c);
  });

candela.use(plausibleAlbedo);                              // global: every material from now on
```

`self.check` is stage-polymorphic as well. A constant is checked at compile time. A field becomes a **runtime assertion** in debug builds: violating pixels show up in a `diagnostics` AOV, highlighted in magenta.

**Composition rules**

```js
const rust = fragment('rust').targets('material').params({ wear: param.float(0) });   // also defines `wear`
material.pbr().with(weathering).with(rust);
```

```text
✖ E140  fragment 'rust' redefines attribute 'wear' from 'weathering'
        → rust.as({ wear: 'rustAmount' })       rename on import
        → fragment('rust', { override: true })  replace explicitly
ⓘ       lowerings run in application order: weathering → rust
```

```diagram
<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 1655.88px; background-color: transparent;" viewBox="0 0 1655.875 85" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;fill:#000000;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#552222;}#my-svg .error-text{fill:#552222;stroke:#552222;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#737373;stroke:#737373;}#my-svg .marker.cross{stroke:#737373;}#my-svg svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;}#my-svg p{margin:0;}#my-svg .label{font-family:Arial,Helvetica,sans-serif;color:#000000;}#my-svg .cluster-label text{fill:#333;}#my-svg .cluster-label span{color:#333;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#000000;color:#000000;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#eee;stroke:#999;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#737373!important;stroke-width:0;stroke:#737373;}#my-svg .arrowheadPath{fill:#333333;}#my-svg .edgePath .path{stroke:#737373;stroke-width:1px;}#my-svg .flowchart-link{stroke:#737373;fill:none;}#my-svg .edgeLabel{background-color:white;text-align:center;}#my-svg .edgeLabel p{background-color:white;}#my-svg .edgeLabel rect{opacity:0.5;background-color:white;fill:white;}#my-svg .labelBkg{background-color:rgba(255, 255, 255, 0.5);}#my-svg .cluster rect{fill:hsl(0, 0%, 98.9215686275%);stroke:#707070;stroke-width:1px;}#my-svg .cluster text{fill:#333;}#my-svg .cluster span{color:#333;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:hsl(-160, 0%, 93.3333333333%);border:1px solid #707070;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#000000;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:white;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:white;padding:2px;}#my-svg .icon-shape .label rect,#my-svg .image-shape .label rect{opacity:0.5;background-color:white;fill:white;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg .node .neo-node{stroke:#999;}#my-svg [data-look="neo"].node rect,#my-svg [data-look="neo"].cluster rect,#my-svg [data-look="neo"].node polygon{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].swimlane.cluster rect{filter:none;}#my-svg [data-look="neo"].node path{stroke:url(#my-svg-gradient);stroke-width:1px;}#my-svg [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node .neo-line path{stroke:#999;filter:none;}#my-svg [data-look="neo"].node circle{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node circle .state-start{fill:#000000;}#my-svg [data-look="neo"].icon-shape .icon{fill:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].icon-shape .icon-neo path{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointEnd-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5;"/></marker><marker id="my-svg_flowchart-v2-crossStart-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M145.297,42.5L157.714,42.5C170.13,42.5,194.964,42.5,219.13,42.5C243.297,42.5,266.797,42.5,278.547,42.5L290.297,42.5" id="my-svg-L_A_B_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_A_B_0" data-points="W3sieCI6MTQ1LjI5Njg3NSwieSI6NDIuNX0seyJ4IjoyMTkuNzk2ODc1LCJ5Ijo0Mi41fSx7IngiOjI5NC4yOTY4NzUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M487.625,42.5L496.669,42.5C505.714,42.5,523.802,42.5,541.224,42.5C558.646,42.5,575.401,42.5,583.779,42.5L592.156,42.5" id="my-svg-L_B_C_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_B_C_0" data-points="W3sieCI6NDg3LjYyNSwieSI6NDIuNX0seyJ4Ijo1NDEuODkwNjI1LCJ5Ijo0Mi41fSx7IngiOjU5Ni4xNTYyNSwieSI6NDIuNX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M695.188,42.5L703.087,42.5C710.987,42.5,726.786,42.5,741.919,42.5C757.052,42.5,771.518,42.5,778.751,42.5L785.984,42.5" id="my-svg-L_C_D_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_C_D_0" data-points="W3sieCI6Njk1LjE4NzUsInkiOjQyLjV9LHsieCI6NzQyLjU4NTkzNzUsInkiOjQyLjV9LHsieCI6Nzg5Ljk4NDM3NSwieSI6NDIuNX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M943.203,42.5L947.37,42.5C951.536,42.5,959.87,42.5,967.536,42.5C975.203,42.5,982.203,42.5,985.703,42.5L989.203,42.5" id="my-svg-L_D_E_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_D_E_0" data-points="W3sieCI6OTQzLjIwMzEyNSwieSI6NDIuNX0seyJ4Ijo5NjguMjAzMTI1LCJ5Ijo0Mi41fSx7IngiOjk5My4yMDMxMjUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M1203.484,42.5L1207.651,42.5C1211.818,42.5,1220.151,42.5,1227.818,42.5C1235.484,42.5,1242.484,42.5,1245.984,42.5L1249.484,42.5" id="my-svg-L_E_F_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_E_F_0" data-points="W3sieCI6MTIwMy40ODQzNzUsInkiOjQyLjV9LHsieCI6MTIyOC40ODQzNzUsInkiOjQyLjV9LHsieCI6MTI1My40ODQzNzUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M1424.766,42.5L1428.932,42.5C1433.099,42.5,1441.432,42.5,1449.099,42.5C1456.766,42.5,1463.766,42.5,1467.266,42.5L1470.766,42.5" id="my-svg-L_F_G_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_F_G_0" data-points="W3sieCI6MTQyNC43NjU2MjUsInkiOjQyLjV9LHsieCI6MTQ0OS43NjU2MjUsInkiOjQyLjV9LHsieCI6MTQ3NC43NjU2MjUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel" transform="translate(219.796875, 42.5)"><g class="label" data-id="L_A_B_0" transform="translate(-49.5, -9.75)"><foreignObject width="99" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>.with(weathering)</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(541.890625, 42.5)"><g class="label" data-id="L_B_C_0" transform="translate(-29.265625, -9.75)"><foreignObject width="58.53125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>.wear(0.4)</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(742.5859375, 42.5)"><g class="label" data-id="L_C_D_0" transform="translate(-22.3984375, -9.75)"><foreignObject width="44.796875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>compile</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_D_E_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_E_F_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_F_G_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="my-svg-flowchart-A-0" data-look="classic" transform="translate(76.6484375, 42.5)"><rect class="basic label-container" style="" x="-68.6484375" y="-24.75" width="137.296875" height="49.5"/><g class="label" style="" transform="translate(-38.6484375, -9.75)"><rect/><foreignObject width="77.296875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>material.pbr()</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-B-1" data-look="classic" transform="translate(390.9609375, 42.5)"><rect class="basic label-container" style="" x="-96.6640625" y="-34.5" width="193.328125" height="69"/><g class="label" style="" transform="translate(-66.6640625, -19.5)"><rect/><foreignObject width="133.328125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>+ wear, dust, dustColor<br />+ aged()</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-C-3" data-look="classic" transform="translate(645.671875, 42.5)"><rect class="basic label-container" style="" x="-49.515625" y="-24.75" width="99.03125" height="49.5"/><g class="label" style="" transform="translate(-19.515625, -9.75)"><rect/><foreignObject width="39.03125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>builder</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-D-5" data-look="classic" transform="translate(866.59375, 42.5)"><rect class="basic label-container" style="" x="-76.609375" y="-24.75" width="153.21875" height="49.5"/><g class="label" style="" transform="translate(-46.609375, -9.75)"><rect/><foreignObject width="93.21875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>lower: pbr sugar</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-E-7" data-look="classic" transform="translate(1098.34375, 42.5)"><rect class="basic label-container" style="" x="-105.140625" y="-24.75" width="210.28125" height="49.5"/><g class="label" style="" transform="translate(-75.140625, -9.75)"><rect/><foreignObject width="150.28125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>lower: weathering.map(...)</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-F-9" data-look="classic" transform="translate(1339.125, 42.5)"><rect class="basic label-container" style="" x="-85.640625" y="-24.75" width="171.28125" height="49.5"/><g class="label" style="" transform="translate(-55.640625, -9.75)"><rect/><foreignObject width="111.28125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>validate: W351 rule</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-G-11" data-look="classic" transform="translate(1561.3203125, 42.5)"><rect class="basic label-container" style="" x="-86.5546875" y="-24.75" width="173.109375" height="49.5"/><g class="label" style="" transform="translate(-56.5546875, -9.75)"><rect/><foreignObject width="113.109375" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>optimise + codegen</p></span></div></foreignObject></g></g></g></g></g><defs><filter id="my-svg-drop-shadow" height="130%" width="130%"><feDropShadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><defs><filter id="my-svg-drop-shadow-small" height="150%" width="150%"><feDropShadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><linearGradient id="my-svg-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="hsl(0, 0%, 83.3333333333%)" stop-opacity="1"/><stop offset="100%" stop-color="hsl(0, 0%, 88.9215686275%)" stop-opacity="1"/></linearGradient></svg>
```

---
### L10 — Participating media

**Atmospheric haze and god rays.** Artists set two intuitive numbers, and the API derives `σs` and `σa` from them (Part I §4):

```js
const haze = medium.homogeneous({
  albedo: 0.98,                   // single-scattering albedo σs / σt
  meanFreePath: u.m(60),          // σt = 1/60 m⁻¹ → meteorological visibility ≈ 3.912 · ℓ ≈ 235 m (Koschmieder)
  phase: phase.hg(0.75),          // strongly forward-scattering: a bright halo around the sun
});

const cathedral = scene()
  .medium(haze)                   // the ambient medium fills the scene
  .add(shape.mesh('nave.glb'))
  .add(shape.mesh('windows.glb').material(material(bsdf.thinDielectric({ ior: 1.52 }))))
  .light(light.sun().elevation(u.deg(30)).illuminance(u.lux(72_000)));
```

**Subsurface scattering is a volume behind an interface,** not a special shading model. Marble is a rough dielectric boundary with a scattering interior:

```js
const marble = material(bsdf.dielectric({ ior: 1.49, roughness: 0.15 }))   // the interface
  .interior(medium.homogeneous({
    albedo: fx.color(0.998, 0.996, 0.990),     // bounded role → bounded spectrum
    meanFreePath: u.mm(5),
    phase: phase.hg(0),
  }));
```

The **same description gets a different lowering per engine**:

| Engine | Lowering of `material(dielectric).interior(medium)` |
| --- | --- |
| `offline` | volumetric random walk inside the boundary (exact for the model) |
| `realtime` | Christensen–Burley diffusion profile fitted from `(albedo, meanFreePath)` |

```text
ⓘ I455  realtime lowering of 'marble' uses a diffusion profile: features thinner than ≈ 3ℓ (15 mm)
        will look too opaque. The offline engine is exact for this medium.
```

**Smoke from a traced density field.** Delta tracking needs a *majorant*, an upper bound on `σt`. Because the field is an IR expression, `majorant: 'auto'` derives one by **interval arithmetic over the DAG**:

```js
const smoke = medium.heterogeneous({
  density: fx.field(p => fx.noise.fbm(p.P.mul(0.8).add(fx.vec3(0, p.time.mul(-0.4), 0)), { octaves: 6 })
    .sub(0.45).max(0).mul(30)),                // σt in m⁻¹
  albedo: 0.92,
  phase: phase.hg(0.3),
  majorant: 'auto',
  bounds: shape.box(4, 6, 4).at(0, 3, 0),
});

const explosion = medium.vdb('fx/explosion.vdb', {
  density: 'density',
  emission: { grid: 'temperature', as: 'blackbody' },   // Planck spectrum per voxel
});
```

```text
✖ E450  majorant: 'auto' failed for '#plume'                            smoke.js:14:13
        density contains p.P.x.reciprocal(), which is unbounded at x = 0 inside bounds.
        → pass majorant: 120 (m⁻¹), or clamp: .min(120)
```

---

### L11 — Spectral rendering

RGB is a property of displays, not of light. Dispersion, interference and metamerism only appear in a spectral engine.

**A dispersive prism.** The Sellmeier equation for Schott N-BK7:

```js
import { spectrum } from 'candela';

const bk7 = ior.sellmeier({                      // n²(λ) = 1 + Σ Bᵢ λ² / (λ² − Cᵢ),  λ in µm
  B: [1.03961212, 0.231792344, 1.01046945],
  C: [0.00600069867, 0.0200179144, 103.560653],
});
bk7.at(u.nm(587.6));     // → 1.5168   n_d
bk7.at(u.nm(400));       // → 1.5308
bk7.at(u.nm(700));       // → 1.5131
bk7.abbe();              // → 64.17    (n_d − 1) / (n_F − n_C)

const prism = scene()
  .add(shape.prism({ apex: u.deg(60), size: u.cm(5) }).material(material(bsdf.dielectric({ ior: bk7 }))))
  .add(shape.plane(1).at(0, -0.03, 0).material(material.pbr().baseColor(0.8)))
  .add(light.spot().power(u.lm(400)).cone(u.deg(0.5)).spectrum(spectrum.blackbody(u.K(5800))).at(-0.5, 0, 0))
  .camera(camera.thinLens().focal(u.mm(50)).at(0, 0.3, 0.6).lookAt(0, 0, 0));

const spectral = engine.offline().spectral({ mode: 'hero', wavelengths: 4, range: [u.nm(360), u.nm(830)] });
await prism.render('#view', { engine: spectral });
```

*Hero wavelength sampling* traces each path with one random "hero" λ and three wavelengths rotated evenly across the range. That costs about the same as RGB. At a dispersive interface the secondary wavelengths are terminated and the hero continues.

```text
⚠ W610  '#prism' has a wavelength-dependent IOR but the engine renders RGB.
        Dispersion will be approximated with 3 wavelengths (visible banding).  → engine.spectral()
```

**Thin-film interference.** Fields carry units, so `Length + Float` would be E120:

```js
const bubble = material(bsdf.thinDielectric({ ior: 1.33 }).thinFilm({
  // gravity drains the film: thinner at the top (→ "black film"), plus swirling turbulence
  thickness: fx.pattern(p => fx.mix(u.nm(900), u.nm(150), p.uv.y)
    .add(fx.noise.perlin(p.P.mul(6).add(p.time.mul(0.3))).mul(u.nm(120)))),
  ior: 1.33,
}));
// reflected phase difference δ = (4π/λ) · n_f · d · cos θ_t + π   (one reflection is off a denser medium)
```

**Illuminants and reflectances are different kinds of spectra:**

```js
const tungsten = spectrum.blackbody(u.K(2700));                    // unbounded: illuminant
const daylight = spectrum.cie('D65');
const triband  = spectrum.cie('F11');                              // narrow-band (triphosphor) fluorescent
const orange   = spectrum.fromRGB('#ff7f00', { role: 'reflectance' });   // smooth, bounded upsampling
const sage     = spectrum.measured('paints/sage.csv', { role: 'reflectance' });

await test.metamerism(sage, spectrum.measured('paints/sage-alt.csv'), { illuminants: ['D65', 'F11', 'A'] });
// reports ΔE2000 per illuminant: a metameric pair matches under D65 and splits apart under F11
```

---

### L12 — Engines: integrators and render graphs

An **engine** is a composition too: an integrator (or a render graph), a sampler, a film, post-processing and a backend.

**An offline reference engine:**

```js
import { sampler, film, filter, post } from 'candela';

const reference = engine.offline()
  .integrator(integrator.path({ maxDepth: 24, nee: true, mis: 'power', rr: { after: 4 } }))
  .sampler(sampler.sobol({ scramble: 'owen', seed: 1 }))
  .spectral({ mode: 'hero', wavelengths: 4 })
  .film(film.hdr({ size: [1920, 1080], filter: filter.blackmanHarris(1.5) })
    .aovs('albedo', 'normal', 'depth', 'variance'))
  .post(post.denoise({ guides: ['albedo', 'normal'] }), post.tonemap('agx'), post.encode('srgb'))
  .backend('webgpu');
```

**A real-time engine as a render graph.** The graph lambda is **stage ①**: it runs once and builds a DAG of passes. The engine then derives resource lifetimes, aliases transient textures and inserts barriers, in the style of a frame graph.

```js
const realtime = engine.realtime().graph(g => {
  const shadows = g.pass(pass.shadowMaps({ cascades: 4, size: 2048 }));
  const gbuf    = g.pass(pass.gbuffer({ targets: ['albedo', 'normal', 'orm', 'motion', 'depth'] }));
  const ibl     = g.pass(pass.ibl.splitSum({ samples: 256 }), { when: 'env-changed' });
  const lit     = g.pass(pass.deferredLighting({ areaLights: 'ltc' }), { gbuf, shadows, ibl });
  const ssr     = g.pass(pass.ssr({ maxSteps: 64 }), { gbuf, color: lit });
  const fog     = g.pass(pass.froxelFog({ slices: 64 }), { gbuf, shadows });
  const comp    = g.pass(pass.composite(), { lit, ssr, fog });
  const taa     = g.pass(pass.taa(), { color: comp, motion: gbuf.motion });
  const bloom   = g.pass(pass.bloom({ threshold: 'physical' }), { color: taa });
  return g.pass(pass.tonemap('agx'), { color: taa, bloom, exposure: 'camera' });
});
```

```diagram
<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 1145.81px; background-color: transparent;" viewBox="0 0 1145.8125 314" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;fill:#000000;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#552222;}#my-svg .error-text{fill:#552222;stroke:#552222;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#737373;stroke:#737373;}#my-svg .marker.cross{stroke:#737373;}#my-svg svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;}#my-svg p{margin:0;}#my-svg .label{font-family:Arial,Helvetica,sans-serif;color:#000000;}#my-svg .cluster-label text{fill:#333;}#my-svg .cluster-label span{color:#333;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#000000;color:#000000;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#eee;stroke:#999;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#737373!important;stroke-width:0;stroke:#737373;}#my-svg .arrowheadPath{fill:#333333;}#my-svg .edgePath .path{stroke:#737373;stroke-width:1px;}#my-svg .flowchart-link{stroke:#737373;fill:none;}#my-svg .edgeLabel{background-color:white;text-align:center;}#my-svg .edgeLabel p{background-color:white;}#my-svg .edgeLabel rect{opacity:0.5;background-color:white;fill:white;}#my-svg .labelBkg{background-color:rgba(255, 255, 255, 0.5);}#my-svg .cluster rect{fill:hsl(0, 0%, 98.9215686275%);stroke:#707070;stroke-width:1px;}#my-svg .cluster text{fill:#333;}#my-svg .cluster span{color:#333;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:hsl(-160, 0%, 93.3333333333%);border:1px solid #707070;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#000000;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:white;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:white;padding:2px;}#my-svg .icon-shape .label rect,#my-svg .image-shape .label rect{opacity:0.5;background-color:white;fill:white;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg .node .neo-node{stroke:#999;}#my-svg [data-look="neo"].node rect,#my-svg [data-look="neo"].cluster rect,#my-svg [data-look="neo"].node polygon{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].swimlane.cluster rect{filter:none;}#my-svg [data-look="neo"].node path{stroke:url(#my-svg-gradient);stroke-width:1px;}#my-svg [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node .neo-line path{stroke:#999;filter:none;}#my-svg [data-look="neo"].node circle{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node circle .state-start{fill:#000000;}#my-svg [data-look="neo"].icon-shape .icon{fill:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].icon-shape .icon-neo path{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointEnd-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5;"/></marker><marker id="my-svg_flowchart-v2-crossStart-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M141.258,127L147.431,124.479C153.604,121.958,165.951,116.917,175.669,113.009C185.388,109.102,192.48,106.33,196.026,104.943L199.572,103.557" id="my-svg-L_SH_LIT_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_SH_LIT_0" data-points="W3sieCI6MTQxLjI1NzgxMjUsInkiOjEyN30seyJ4IjoxNzguMjk2ODc1LCJ5IjoxMTEuODc1fSx7IngiOjIwMy4yOTY4NzUsInkiOjEwMi4xMDAyMTgzMjM4ODU0fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M121.013,256.5L130.56,250.646C140.107,244.792,159.202,233.083,181.445,208.634C203.688,184.184,229.08,146.994,241.776,128.399L254.471,109.803" id="my-svg-L_GB_LIT_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_GB_LIT_0" data-points="W3sieCI6MTIxLjAxMjUwOTc4NjAxMjUzLCJ5IjoyNTYuNX0seyJ4IjoxNzguMjk2ODc1LCJ5IjoyMjEuMzc1fSx7IngiOjI1Ni43MjY2OTk3OTA3OTQ5NSwieSI6MTA2LjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M153.297,42.5L157.464,42.5C161.63,42.5,169.964,42.5,177.656,43.52C185.349,44.54,192.402,46.58,195.928,47.6L199.454,48.62" id="my-svg-L_IBL_LIT_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_IBL_LIT_0" data-points="W3sieCI6MTUzLjI5Njg3NSwieSI6NDIuNX0seyJ4IjoxNzguMjk2ODc1LCJ5Ijo0Mi41fSx7IngiOjIwMy4yOTY4NzUsInkiOjQ5LjczMTQ5OTkyMzM5NTEzfV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M130.773,265.85L138.694,263.417C146.615,260.984,162.456,256.117,187.374,253.683C212.292,251.25,246.286,251.25,280.281,251.25C314.276,251.25,348.271,251.25,373.369,236.047C398.467,220.843,414.668,190.437,422.769,175.233L430.869,160.03" id="my-svg-L_GB_SSR_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_GB_SSR_0" data-points="W3sieCI6MTMwLjc3MzQzNzUsInkiOjI2NS44NTAzNjgwMjk0NDIzNH0seyJ4IjoxNzguMjk2ODc1LCJ5IjoyNTEuMjV9LHsieCI6MjgwLjI4MTI1LCJ5IjoyNTEuMjV9LHsieCI6MzgyLjI2NTYyNSwieSI6MjUxLjI1fSx7IngiOjQzMi43NTAyMjg4MTc5OTE2LCJ5IjoxNTYuNX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M357.266,56.903L361.432,56.086C365.599,55.268,373.932,53.634,385.002,61.463C396.071,69.291,409.876,86.583,416.779,95.228L423.682,103.874" id="my-svg-L_LIT_SSR_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_LIT_SSR_0" data-points="W3sieCI6MzU3LjI2NTYyNSwieSI6NTYuOTAyNzExODEyNDcxMjc0fSx7IngiOjM4Mi4yNjU2MjUsInkiOjUyfSx7IngiOjQyNi4xNzcyNjI5MzEwMzQ1LCJ5IjoxMDd9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M130.773,276.117L138.694,275.306C146.615,274.495,162.456,272.872,181.573,263.305C200.691,253.738,223.086,236.226,234.283,227.47L245.48,218.714" id="my-svg-L_GB_FOG_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_GB_FOG_0" data-points="W3sieCI6MTMwLjc3MzQzNzUsInkiOjI3Ni4xMTY3ODkzNDMxNDc0NX0seyJ4IjoxNzguMjk2ODc1LCJ5IjoyNzEuMjV9LHsieCI6MjQ4LjYzMDkyNjcyNDEzNzk0LCJ5IjoyMTYuMjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M141.448,176.5L147.59,179C153.731,181.5,166.014,186.5,178.969,189C191.924,191.5,205.552,191.5,212.366,191.5L219.18,191.5" id="my-svg-L_SH_FOG_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_SH_FOG_0" data-points="W3sieCI6MTQxLjQ0ODQwODAxODg2NzkyLCJ5IjoxNzYuNX0seyJ4IjoxNzguMjk2ODc1LCJ5IjoxOTEuNX0seyJ4IjoyMjMuMTc5Njg3NSwieSI6MTkxLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M357.266,72L361.432,72C365.599,72,373.932,72,388.711,72C403.49,72,424.714,72,445.938,72C467.161,72,488.385,72,508.749,82.328C529.113,92.656,548.616,113.311,558.367,123.639L568.119,133.967" id="my-svg-L_LIT_CMP_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_LIT_CMP_0" data-points="W3sieCI6MzU3LjI2NTYyNSwieSI6NzJ9LHsieCI6MzgyLjI2NTYyNSwieSI6NzJ9LHsieCI6NDQ1LjkzNzUsInkiOjcyfSx7IngiOjUwOS42MDkzNzUsInkiOjcyfSx7IngiOjU3MC44NjUxMjgxMzgwNzUzLCJ5IjoxMzYuODc1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M484.609,131.75L488.776,131.75C492.943,131.75,501.276,131.75,508.981,132.999C516.685,134.248,523.761,136.746,527.299,137.995L530.838,139.244" id="my-svg-L_SSR_CMP_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_SSR_CMP_0" data-points="W3sieCI6NDg0LjYwOTM3NSwieSI6MTMxLjc1fSx7IngiOjUwOS42MDkzNzUsInkiOjEzMS43NX0seyJ4Ijo1MzQuNjA5Mzc1LCJ5IjoxNDAuNTc1NzAxNjI0ODE1Mzd9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M337.383,191.5L344.863,191.5C352.344,191.5,367.305,191.5,385.397,191.5C403.49,191.5,424.714,191.5,445.938,191.5C467.161,191.5,488.385,191.5,502.535,190.251C516.685,189.002,523.761,186.504,527.299,185.255L530.838,184.006" id="my-svg-L_FOG_CMP_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_FOG_CMP_0" data-points="W3sieCI6MzM3LjM4MjgxMjUsInkiOjE5MS41fSx7IngiOjM4Mi4yNjU2MjUsInkiOjE5MS41fSx7IngiOjQ0NS45Mzc1LCJ5IjoxOTEuNX0seyJ4Ijo1MDkuNjA5Mzc1LCJ5IjoxOTEuNX0seyJ4Ijo1MzQuNjA5Mzc1LCJ5IjoxODIuNjc0Mjk4Mzc1MTg0NjN9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M653.859,161.625L658.026,161.625C662.193,161.625,670.526,161.625,682.357,173.564C694.189,185.503,709.519,209.381,717.183,221.32L724.848,233.259" id="my-svg-L_CMP_TAA_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_CMP_TAA_0" data-points="W3sieCI6NjUzLjg1OTM3NSwieSI6MTYxLjYyNX0seyJ4Ijo2NzguODU5Mzc1LCJ5IjoxNjEuNjI1fSx7IngiOjcyNy4wMDkwNDYwNTI2MzE2LCJ5IjoyMzYuNjI1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M130.773,286.383L138.694,287.194C146.615,288.005,162.456,289.628,187.374,290.439C212.292,291.25,246.286,291.25,280.281,291.25C314.276,291.25,348.271,291.25,375.88,291.25C403.49,291.25,424.714,291.25,445.938,291.25C467.161,291.25,488.385,291.25,513.102,291.25C537.818,291.25,566.026,291.25,594.234,291.25C622.443,291.25,650.651,291.25,668.318,289.588C685.984,287.926,693.109,284.602,696.672,282.94L700.234,281.278" id="my-svg-L_GB_TAA_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_GB_TAA_0" data-points="W3sieCI6MTMwLjc3MzQzNzUsInkiOjI4Ni4zODMyMTA2NTY4NTI1NX0seyJ4IjoxNzguMjk2ODc1LCJ5IjoyOTEuMjV9LHsieCI6MjgwLjI4MTI1LCJ5IjoyOTEuMjV9LHsieCI6MzgyLjI2NTYyNSwieSI6MjkxLjI1fSx7IngiOjQ0NS45Mzc1LCJ5IjoyOTEuMjV9LHsieCI6NTA5LjYwOTM3NSwieSI6MjkxLjI1fSx7IngiOjU5NC4yMzQzNzUsInkiOjI5MS4yNX0seyJ4Ijo2NzguODU5Mzc1LCJ5IjoyOTEuMjV9LHsieCI6NzAzLjg1OTM3NSwieSI6Mjc5LjU4NzE5NjUzNTMxNzh9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M781.938,243.163L786.104,241.219C790.271,239.275,798.604,235.388,806.271,233.444C813.938,231.5,820.938,231.5,824.438,231.5L827.938,231.5" id="my-svg-L_TAA_BLM_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_TAA_BLM_0" data-points="W3sieCI6NzgxLjkzNzUsInkiOjI0My4xNjI4MDM0NjQ2ODIyfSx7IngiOjgwNi45Mzc1LCJ5IjoyMzEuNX0seyJ4Ijo4MzEuOTM3NSwieSI6MjMxLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M781.938,279.587L786.104,281.531C790.271,283.475,798.604,287.362,814.889,289.306C831.174,291.25,855.411,291.25,879.648,291.25C903.885,291.25,928.122,291.25,943.766,290.249C959.41,289.248,966.461,287.246,969.986,286.246L973.511,285.245" id="my-svg-L_TAA_TM_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_TAA_TM_0" data-points="W3sieCI6NzgxLjkzNzUsInkiOjI3OS41ODcxOTY1MzUzMTc4fSx7IngiOjgwNi45Mzc1LCJ5IjoyOTEuMjV9LHsieCI6ODc5LjY0ODQzNzUsInkiOjI5MS4yNX0seyJ4Ijo5NTIuMzU5Mzc1LCJ5IjoyOTEuMjV9LHsieCI6OTc3LjM1OTM3NSwieSI6Mjg0LjE1MjIxOTkxMjM5MTR9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M927.359,231.5L931.526,231.5C935.693,231.5,944.026,231.5,951.718,232.501C959.41,233.502,966.461,235.504,969.986,236.504L973.511,237.505" id="my-svg-L_BLM_TM_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_BLM_TM_0" data-points="W3sieCI6OTI3LjM1OTM3NSwieSI6MjMxLjV9LHsieCI6OTUyLjM1OTM3NSwieSI6MjMxLjV9LHsieCI6OTc3LjM1OTM3NSwieSI6MjM4LjU5Nzc4MDA4NzYwODU4fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel"><g class="label" data-id="L_SH_LIT_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_GB_LIT_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_IBL_LIT_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_GB_SSR_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_LIT_SSR_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_GB_FOG_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_SH_FOG_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_LIT_CMP_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_SSR_CMP_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_FOG_CMP_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_CMP_TAA_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(445.9375, 291.25)"><g class="label" data-id="L_GB_TAA_0" transform="translate(-19.515625, -9.75)"><foreignObject width="39.03125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>motion</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_TAA_BLM_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_TAA_TM_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_BLM_TM_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="my-svg-flowchart-SH-0" data-look="classic" transform="translate(80.6484375, 151.75)"><rect class="basic label-container" style="" x="-68.3046875" y="-24.75" width="136.609375" height="49.5"/><g class="label" style="" transform="translate(-38.3046875, -9.75)"><rect/><foreignObject width="76.609375" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>shadowMaps</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-LIT-1" data-look="classic" transform="translate(280.28125, 72)"><rect class="basic label-container" style="" x="-76.984375" y="-34.5" width="153.96875" height="69"/><g class="label" style="" transform="translate(-46.984375, -19.5)"><rect/><foreignObject width="93.96875" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>deferredLighting<br />LTC area lights</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-GB-2" data-look="classic" transform="translate(80.6484375, 281.25)"><rect class="basic label-container" style="" x="-50.125" y="-24.75" width="100.25" height="49.5"/><g class="label" style="" transform="translate(-20.125, -9.75)"><rect/><foreignObject width="40.25" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>gbuffer</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-IBL-4" data-look="classic" transform="translate(80.6484375, 42.5)"><rect class="basic label-container" style="" x="-72.6484375" y="-34.5" width="145.296875" height="69"/><g class="label" style="" transform="translate(-42.6484375, -19.5)"><rect/><foreignObject width="85.296875" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>ibl.splitSum<br />on env change</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-SSR-7" data-look="classic" transform="translate(445.9375, 131.75)"><rect class="basic label-container" style="" x="-38.671875" y="-24.75" width="77.34375" height="49.5"/><g class="label" style="" transform="translate(-8.671875, -9.75)"><rect/><foreignObject width="17.34375" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>ssr</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-FOG-11" data-look="classic" transform="translate(280.28125, 191.5)"><rect class="basic label-container" style="" x="-57.1015625" y="-24.75" width="114.203125" height="49.5"/><g class="label" style="" transform="translate(-27.1015625, -9.75)"><rect/><foreignObject width="54.203125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>froxelFog</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-CMP-15" data-look="classic" transform="translate(594.234375, 161.625)"><rect class="basic label-container" style="" x="-59.625" y="-24.75" width="119.25" height="49.5"/><g class="label" style="" transform="translate(-29.625, -9.75)"><rect/><foreignObject width="59.25" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>composite</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-TAA-21" data-look="classic" transform="translate(742.8984375, 261.375)"><rect class="basic label-container" style="" x="-39.0390625" y="-24.75" width="78.078125" height="49.5"/><g class="label" style="" transform="translate(-9.0390625, -9.75)"><rect/><foreignObject width="18.078125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>taa</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-BLM-25" data-look="classic" transform="translate(879.6484375, 231.5)"><rect class="basic label-container" style="" x="-47.7109375" y="-24.75" width="95.421875" height="49.5"/><g class="label" style="" transform="translate(-17.7109375, -9.75)"><rect/><foreignObject width="35.421875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>bloom</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-TM-27" data-look="classic" transform="translate(1057.5859375, 261.375)"><rect class="basic label-container" style="" x="-80.2265625" y="-34.5" width="160.453125" height="69"/><g class="label" style="" transform="translate(-50.2265625, -19.5)"><rect/><foreignObject width="100.453125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>tonemap AgX<br />camera exposure</p></span></div></foreignObject></g></g></g></g></g><defs><filter id="my-svg-drop-shadow" height="130%" width="130%"><feDropShadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><defs><filter id="my-svg-drop-shadow-small" height="150%" width="150%"><feDropShadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><linearGradient id="my-svg-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="hsl(0, 0%, 83.3333333333%)" stop-opacity="1"/><stop offset="100%" stop-color="hsl(0, 0%, 88.9215686275%)" stop-opacity="1"/></linearGradient></svg>
```

**Passes are components.** You define them the same way as materials: params, typed inputs and a traced kernel. This false-colour exposure pass is a tool cinematographers use; agents use it too (L16):

```js
const falseColor = pass.define('falseColor', {
  inputs: { color: 'hdr' },
  kernel: ({ color }, params, { camera }) => {
    const stops = fx.log2(fx.luminance(color).div(camera.middleGrey()));   // 0 = 18 % grey
    return fx.ramp(stops, [[-4, '#2b0a3d'], [-2, '#1f5fbf'], [0, '#7f7f7f'], [2, '#f2c12e'], [3.5, '#e8361c']]);
  },
});
```

**Each component is lowered per engine.** A missing lowering is a compile error, never a silent fallback:

| Component | `offline` (path tracing) | `realtime` (raster) |
| --- | --- | --- |
| `bsdf.layer` | stochastic layer evaluation | analytic coat approximation |
| `material.interior(medium)` | volumetric random walk | diffusion profile |
| `medium.heterogeneous` | delta / ratio tracking | froxel fog (requires `pass.froxelFog`) |
| `light.area` | MIS area sampling | linearly transformed cosines (LTC) |
| `light.env` | importance-sampled environment | split-sum prefiltered IBL |
| wavelength-dependent IOR | hero wavelength | 3-wavelength approximation (W610) |

```text
✖ E710  '#plume' (medium.heterogeneous) has no lowering in engine 'realtime'
        → add g.pass(pass.froxelFog()) to the graph, or smoke.fallback(medium.homogeneous({ … }))
```

**Mix and compare engines:**

```js
const app = engine.adaptive({ interactive: realtime, idle: reference, idleAfter: 600 /* ms */ });
await app.run(s, { canvas: '#view' });

const report = await engine.compare(s, { reference, candidate: realtime, metric: 'flip', spp: 4096 });
report.mean;                       // mean FLIP error
report.heatmap.show('#diff');      // where the real-time approximations diverge
```

---

### L13 — Write your own integrator

The grammar exposes the primitives of transport: `intersect`, `bsdf.eval/sample/pdf`, `lights.sample/pdf`, `visible` and `mis`. An integrator is a **traced kernel**. Static params arrive as JS numbers, which is what lets loops unroll.

**Warm-up: ambient occlusion.**

```js
const ao = integrator.define('ao', {
  params: { radius: param.length(u.m(0.5)), samples: param.int(4).static() },
  kernel: ({ ray, scene, sampler }, { radius, samples }) => {
    const hit = scene.intersect(ray);
    let open = fx.float(0);
    for (let k = 0; k < samples; k++) {                    // `samples` is static → plain JS number → unrolled
      const d = sampler.cosineHemisphere(hit.N);           // pdf = cos θ / π, which cancels the cosine
      open = open.add(scene.occluded(hit.spawn(d), radius).select(0, 1));
    }
    return fx.select(hit.missed, fx.color(1), fx.color(open.div(samples)));
  },
});
```

**The real thing: a unidirectional path tracer with next-event estimation, MIS and Russian roulette,** in about forty lines. It is the estimator from Part I §5, written in the grammar:

```js
import { mis } from 'candela';

export const pathMIS = integrator.define('path-mis', {
  params: {
    maxDepth: param.int(12).range(1, 64).static(),
    rrAfter:  param.int(4).static(),
  },
  kernel: ({ ray, scene, sampler }, { maxDepth, rrAfter }) => {
    const init = { L: fx.spectrum(0), beta: fx.spectrum(1), ray, pdfPrev: fx.float(1), delta: fx.bool(true) };

    return fx.loop(init, { maxIter: maxDepth }, (s, { depth, exit }) => {
      const hit = scene.intersect(s.ray);

      // 1 ─ escaped: environment, MIS-weighted against environment sampling at the previous vertex
      fx.when(hit.missed, () => {
        const Le = scene.env.eval(s.ray.d);
        const w  = fx.select(s.delta, 1, mis.power(s.pdfPrev, scene.env.pdf(s.ray.d)));
        exit({ L: s.L.add(s.beta.mul(Le).mul(w)) });
      });

      // 2 ─ emitter hit by BSDF sampling
      const Le = hit.emitted(s.ray.d.neg());
      const wE = fx.select(s.delta, 1, mis.power(s.pdfPrev, scene.lights.pdf(s.ray, hit)));
      let L = s.L.add(s.beta.mul(Le).mul(wE));

      // 3 ─ next-event estimation: sample a light, weight against the BSDF strategy
      const bsdf = hit.bsdf();
      const ls   = scene.lights.sample(hit, sampler.next2D(), sampler.next1D());
      const fL   = bsdf.eval(hit.wo, ls.wi).mul(hit.N.dot(ls.wi).abs());
      const wL   = fx.select(ls.delta, 1, mis.power(ls.pdf, bsdf.pdf(hit.wo, ls.wi)));
      L = L.add(s.beta.mul(fL).mul(ls.Li).mul(wL).div(ls.pdf).mul(scene.visible(hit, ls)));

      // 4 ─ continue the path by BSDF sampling
      const bs = bsdf.sample(hit.wo, sampler.next1D(), sampler.next2D());
      fx.when(bs.failed, () => exit({ L }));
      let beta = s.beta.mul(bs.weight);                    // f · |cos θ| / pdf, computed stably by the BSDF

      // 5 ─ Russian roulette: unbiased because survivors are divided by the survival probability
      const pSurvive = fx.min(1, beta.max()).max(0.05);
      const rr = depth.gte(rrAfter);
      fx.when(rr.and(sampler.next1D().gte(pSurvive)), () => exit({ L }));
      beta = fx.select(rr, beta.div(pSurvive), beta);

      return { L, beta, ray: hit.spawn(bs.wi), pdfPrev: bs.pdf, delta: bs.delta };
    }).L;
  },
});
```

Notes on the trace:

- `fx.when` records **both** sides. `exit` becomes a structured early-out in WGSL.
- `let` rebinding produces SSA nodes, and `mis.power(a, b)` is `a² / (a² + b²)`.
- `maxDepth` bounds the loop at compile time, which matters on GPUs.

**Use it, and check the maths empirically:**

```js
const mine = engine.offline().integrator(pathMIS.maxDepth(8));

const conv = await engine.compare(s, {
  reference: engine.offline().integrator(integrator.path()).spp(1 << 16),
  candidate: mine, metric: 'relMSE', spp: [1, 4, 16, 64, 256, 1024],
});
conv.plot('#convergence', { logLog: true });   // an unbiased estimator gives slope −1: MSE ∝ 1/N
```

Integrators compose with fragments too. A biased firefly clamp announces itself:

```text
ⓘ I460  pathMIS.with(clampIndirect(10)) is biased (energy above the clamp is discarded).
        It is ignored when this engine is used as `reference` in engine.compare().
```

---

### L14 — The IR: inspect, rewrite, diff, cache

```js
const ir = s.ir();
ir.hash;                                   // 'b3f19c…' content address of the whole scene
ir.stats();                                // { nodes, shared, byType: { BSDF, Field, Light, … } }
console.log(ir.print({ focus: '#car', depth: 3 }));
console.log(ir.toMermaid({ focus: '#car.material' }));   // a diagram of any subgraph, for docs
const json = ir.toJSON();                  // stable and diffable; scene.fromJSON(json) round-trips
```

**Stop the pipeline anywhere:**

```js
const stages = await engine.realtime().compile(s, {
  keep: ['traced', 'validated', 'lowered', 'optimized', 'wgsl'],
});
stages.lowered.print({ focus: '#car.material' });
stages.wgsl.get('material:#car').source;
stages.optimized.report();      // what was folded, deduplicated, hoisted or baked, and why
```

**Automatic stage assignment.** Each node knows its **dependency set**: which context variables it reads (`uv`, `P`, `N`, `ωo`, `λ`, `time`, `param:*`, `instance`). The optimiser hoists every node to the cheapest stage its dependencies allow. This is loop-invariant code motion, generalised across stages:

```diagram
<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 1161.53px; background-color: transparent;" viewBox="0 0 1161.53125 85" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;fill:#000000;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#552222;}#my-svg .error-text{fill:#552222;stroke:#552222;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#737373;stroke:#737373;}#my-svg .marker.cross{stroke:#737373;}#my-svg svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;}#my-svg p{margin:0;}#my-svg .label{font-family:Arial,Helvetica,sans-serif;color:#000000;}#my-svg .cluster-label text{fill:#333;}#my-svg .cluster-label span{color:#333;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#000000;color:#000000;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#eee;stroke:#999;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#737373!important;stroke-width:0;stroke:#737373;}#my-svg .arrowheadPath{fill:#333333;}#my-svg .edgePath .path{stroke:#737373;stroke-width:1px;}#my-svg .flowchart-link{stroke:#737373;fill:none;}#my-svg .edgeLabel{background-color:white;text-align:center;}#my-svg .edgeLabel p{background-color:white;}#my-svg .edgeLabel rect{opacity:0.5;background-color:white;fill:white;}#my-svg .labelBkg{background-color:rgba(255, 255, 255, 0.5);}#my-svg .cluster rect{fill:hsl(0, 0%, 98.9215686275%);stroke:#707070;stroke-width:1px;}#my-svg .cluster text{fill:#333;}#my-svg .cluster span{color:#333;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:hsl(-160, 0%, 93.3333333333%);border:1px solid #707070;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#000000;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:white;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:white;padding:2px;}#my-svg .icon-shape .label rect,#my-svg .image-shape .label rect{opacity:0.5;background-color:white;fill:white;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg .node .neo-node{stroke:#999;}#my-svg [data-look="neo"].node rect,#my-svg [data-look="neo"].cluster rect,#my-svg [data-look="neo"].node polygon{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].swimlane.cluster rect{filter:none;}#my-svg [data-look="neo"].node path{stroke:url(#my-svg-gradient);stroke-width:1px;}#my-svg [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node .neo-line path{stroke:#999;filter:none;}#my-svg [data-look="neo"].node circle{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node circle .state-start{fill:#000000;}#my-svg [data-look="neo"].icon-shape .icon{fill:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].icon-shape .icon-neo path{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointEnd-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5;"/></marker><marker id="my-svg_flowchart-v2-crossStart-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M151.828,42.5L155.995,42.5C160.161,42.5,168.495,42.5,176.161,42.5C183.828,42.5,190.828,42.5,194.328,42.5L197.828,42.5" id="my-svg-L_C_PR_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_C_PR_0" data-points="W3sieCI6MTUxLjgyODEyNSwieSI6NDIuNX0seyJ4IjoxNzYuODI4MTI1LCJ5Ijo0Mi41fSx7IngiOjIwMS44MjgxMjUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M354.359,42.5L358.526,42.5C362.693,42.5,371.026,42.5,378.693,42.5C386.359,42.5,393.359,42.5,396.859,42.5L400.359,42.5" id="my-svg-L_PR_IN_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_PR_IN_0" data-points="W3sieCI6MzU0LjM1OTM3NSwieSI6NDIuNX0seyJ4IjozNzkuMzU5Mzc1LCJ5Ijo0Mi41fSx7IngiOjQwNC4zNTkzNzUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M514.938,42.5L519.104,42.5C523.271,42.5,531.604,42.5,539.271,42.5C546.938,42.5,553.938,42.5,557.438,42.5L560.938,42.5" id="my-svg-L_IN_UV_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_IN_UV_0" data-points="W3sieCI6NTE0LjkzNzUsInkiOjQyLjV9LHsieCI6NTM5LjkzNzUsInkiOjQyLjV9LHsieCI6NTY0LjkzNzUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M735.516,42.5L739.682,42.5C743.849,42.5,752.182,42.5,759.849,42.5C767.516,42.5,774.516,42.5,778.016,42.5L781.516,42.5" id="my-svg-L_UV_PN_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_UV_PN_0" data-points="W3sieCI6NzM1LjUxNTYyNSwieSI6NDIuNX0seyJ4Ijo3NjAuNTE1NjI1LCJ5Ijo0Mi41fSx7IngiOjc4NS41MTU2MjUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M945.266,42.5L949.432,42.5C953.599,42.5,961.932,42.5,969.599,42.5C977.266,42.5,984.266,42.5,987.766,42.5L991.266,42.5" id="my-svg-L_PN_WL_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_PN_WL_0" data-points="W3sieCI6OTQ1LjI2NTYyNSwieSI6NDIuNX0seyJ4Ijo5NzAuMjY1NjI1LCJ5Ijo0Mi41fSx7IngiOjk5NS4yNjU2MjUsInkiOjQyLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel"><g class="label" data-id="L_C_PR_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_PR_IN_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_IN_UV_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_UV_PN_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_PN_WL_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="my-svg-flowchart-C-0" data-look="classic" transform="translate(79.9140625, 42.5)"><rect class="basic label-container" style="" x="-71.9140625" y="-34.5" width="143.828125" height="69"/><g class="label" style="" transform="translate(-41.9140625, -19.5)"><rect/><foreignObject width="83.828125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>const<br />fold at compile</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-PR-1" data-look="classic" transform="translate(278.09375, 42.5)"><rect class="basic label-container" style="" x="-76.265625" y="-34.5" width="152.53125" height="69"/><g class="label" style="" transform="translate(-46.265625, -19.5)"><rect/><foreignObject width="92.53125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>param<br />host, on change</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-IN-3" data-look="classic" transform="translate(459.6484375, 42.5)"><rect class="basic label-container" style="" x="-55.2890625" y="-34.5" width="110.578125" height="69"/><g class="label" style="" transform="translate(-25.2890625, -19.5)"><rect/><foreignObject width="50.578125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>instance<br />per draw</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-UV-5" data-look="classic" transform="translate(650.2265625, 42.5)"><rect class="basic label-container" style="" x="-85.2890625" y="-34.5" width="170.578125" height="69"/><g class="label" style="" transform="translate(-55.2890625, -19.5)"><rect/><foreignObject width="110.578125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>uv only<br />bakeable to texture</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-PN-7" data-look="classic" transform="translate(865.390625, 42.5)"><rect class="basic label-container" style="" x="-79.875" y="-34.5" width="159.75" height="69"/><g class="label" style="" transform="translate(-49.875, -19.5)"><rect/><foreignObject width="99.75" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>P, N<br />per shading point</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-WL-9" data-look="classic" transform="translate(1074.3984375, 42.5)"><rect class="basic label-container" style="" x="-79.1328125" y="-34.5" width="158.265625" height="69"/><g class="label" style="" transform="translate(-49.1328125, -19.5)"><rect/><foreignObject width="98.265625" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>wo, lambda, time<br />per sample</p></span></div></foreignObject></g></g></g></g></g><defs><filter id="my-svg-drop-shadow" height="130%" width="130%"><feDropShadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><defs><filter id="my-svg-drop-shadow-small" height="150%" width="150%"><feDropShadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><linearGradient id="my-svg-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="hsl(0, 0%, 83.3333333333%)" stop-opacity="1"/><stop offset="100%" stop-color="hsl(0, 0%, 88.9215686275%)" stop-opacity="1"/></linearGradient></svg>
```

This is why `P.gloss.map(g => 1 - g)` runs once on the CPU when you write it inside a pattern, and why a pattern that depends only on `uv` can be baked.

**A custom IR pass,** shipped as an engine fragment:

```js
export const bakeStaticPatterns = fragment('bake-static-patterns')
  .targets('engine')
  .pass('optimize', (ir, { cost }) => ir.rewrite(
    n => n.kind === 'field' && n.deps.subsetOf(['uv']) && cost(n) > 64,   // uv-only and expensive
    n => fx.texture.baked(n, { size: 2048, mips: true }),                  // evaluated once on the GPU
  ));

const fast = engine.realtime().with(bakeStaticPatterns);
```

**Functional edits and diffs.** Graph mode is persistent: `edit` returns a new scene and shares everything it did not touch.

```js
const a = s;
const b = s.edit('#car', car => car.material(car.material().roughness(0.2)));
console.log(a.ir().diff(b.ir()).print());
```

```text
diff b3f19c → 0e7a21
  value      #car.material.roughness   0.35 → 0.2    literal: kernel unchanged, constant row rewritten
  structure  —
  cost       uniform
```

**Caching.** Kernels are keyed by *structural* hash, which excludes literals, so caches survive edits and reloads:

```js
engine.realtime().cache({ store: 'indexeddb', key: 'structural' });
```

---

### L15 — Live mode: mutations, transactions, behaviours

`run()` returns a **World**: the IR plus GPU state, exposed through proxied live handles. Reads return current values, and writes become validated **patches**.

```js
const world = await engine.realtime().run(s, { canvas: '#view' });

const lamp = world.$('#lamp');
lamp.power = u.lm(1500);                         // value patch → uniform write
lamp.temperature = 3000;                         // a bare number means the canonical unit (K)
world.$('#car').position.y += 0.1;               // transform patch → BVH refit
world.$$('.bulb').forEach(b => { b.temperature = u.K(2200); });   // selectors: #id, .tag, kind, a > b

world.add(shape.box(0.5).id('crate').at(2, 0.25, 0).material(material.pbr()));   // structure patch
world.remove('#crate');

await world.tx(w => {                            // atomic: applied at the next frame boundary, one undo step
  w.$('#key').power = u.lm(1200);
  w.$('#fill').power = u.lm(400);
});
world.history.undo();
```

```text
✖ E104  world.$('#lamp').powr = …      'powr' is not an attribute of light.point. Did you mean 'power'?
✖ E120  world.$('#lamp').power = 500 lx    power expects luminous flux [lm]; got illuminance [lx]
```

**Patch classes, cheapest first.** The cost class is reported for every patch, and agents see it too:

| Class | Example | What happens |
| --- | --- | --- |
| value | `lamp.power = …`, a literal changes, a dynamic param moves | constant-buffer write |
| transform | `car.position.y += 0.1` | instance transform write and top-level BVH refit |
| specialisation | a static param flips | cached kernel variant swapped in, or compiled in the background |
| structure | `world.add(…)`, the BSDF topology changes | incremental compile of the affected subgraph, BVH rebuild of the subtree |

```diagram
<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 771.984px; background-color: transparent;" viewBox="0 0 771.984375 783.125" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;fill:#000000;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#552222;}#my-svg .error-text{fill:#552222;stroke:#552222;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#737373;stroke:#737373;}#my-svg .marker.cross{stroke:#737373;}#my-svg svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;}#my-svg p{margin:0;}#my-svg .label{font-family:Arial,Helvetica,sans-serif;color:#000000;}#my-svg .cluster-label text{fill:#333;}#my-svg .cluster-label span{color:#333;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#000000;color:#000000;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#eee;stroke:#999;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#737373!important;stroke-width:0;stroke:#737373;}#my-svg .arrowheadPath{fill:#333333;}#my-svg .edgePath .path{stroke:#737373;stroke-width:1px;}#my-svg .flowchart-link{stroke:#737373;fill:none;}#my-svg .edgeLabel{background-color:white;text-align:center;}#my-svg .edgeLabel p{background-color:white;}#my-svg .edgeLabel rect{opacity:0.5;background-color:white;fill:white;}#my-svg .labelBkg{background-color:rgba(255, 255, 255, 0.5);}#my-svg .cluster rect{fill:hsl(0, 0%, 98.9215686275%);stroke:#707070;stroke-width:1px;}#my-svg .cluster text{fill:#333;}#my-svg .cluster span{color:#333;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:hsl(-160, 0%, 93.3333333333%);border:1px solid #707070;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#000000;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:white;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:white;padding:2px;}#my-svg .icon-shape .label rect,#my-svg .image-shape .label rect{opacity:0.5;background-color:white;fill:white;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg .node .neo-node{stroke:#999;}#my-svg [data-look="neo"].node rect,#my-svg [data-look="neo"].cluster rect,#my-svg [data-look="neo"].node polygon{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].swimlane.cluster rect{filter:none;}#my-svg [data-look="neo"].node path{stroke:url(#my-svg-gradient);stroke-width:1px;}#my-svg [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node .neo-line path{stroke:#999;filter:none;}#my-svg [data-look="neo"].node circle{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node circle .state-start{fill:#000000;}#my-svg [data-look="neo"].icon-shape .icon{fill:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].icon-shape .icon-neo path{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointEnd-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5;"/></marker><marker id="my-svg_flowchart-v2-crossStart-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M344.434,57.5L344.434,61.667C344.434,65.833,344.434,74.167,344.434,81.833C344.434,89.5,344.434,96.5,344.434,100L344.434,103.5" id="my-svg-L_A_V_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_A_V_0" data-points="W3sieCI6MzQ0LjQzMzU5Mzc1LCJ5Ijo1Ny41fSx7IngiOjM0NC40MzM1OTM3NSwieSI6ODIuNX0seyJ4IjozNDQuNDMzNTkzNzUsInkiOjEwNy41fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M344.434,176.5L344.434,180.667C344.434,184.833,344.434,193.167,344.434,200.833C344.434,208.5,344.434,215.5,344.434,219L344.434,222.5" id="my-svg-L_V_D_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_V_D_0" data-points="W3sieCI6MzQ0LjQzMzU5Mzc1LCJ5IjoxNzYuNX0seyJ4IjozNDQuNDMzNTkzNzUsInkiOjIwMS41fSx7IngiOjM0NC40MzM1OTM3NSwieSI6MjI2LjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M344.434,276L344.434,280.167C344.434,284.333,344.434,292.667,344.434,300.333C344.434,308,344.434,315,344.434,318.5L344.434,322" id="my-svg-L_D_K_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_D_K_0" data-points="W3sieCI6MzQ0LjQzMzU5Mzc1LCJ5IjoyNzZ9LHsieCI6MzQ0LjQzMzU5Mzc1LCJ5IjozMDF9LHsieCI6MzQ0LjQzMzU5Mzc1LCJ5IjozMjZ9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M309.006,382.697L270.04,394.393C231.074,406.09,153.142,429.482,114.177,447.929C75.211,466.375,75.211,479.875,75.211,486.625L75.211,493.375" id="my-svg-L_K_U_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_K_U_0" data-points="W3sieCI6MzA5LjAwNTUyNzc5MTIyMzUsInkiOjM4Mi42OTY5MzQwNDEyMjM1fSx7IngiOjc1LjIxMDkzNzUsInkiOjQ1Mi44NzV9LHsieCI6NzUuMjEwOTM3NSwieSI6NDk3LjM3NX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M319.424,393.115L307.591,403.075C295.759,413.035,272.094,432.955,260.262,449.665C248.43,466.375,248.43,479.875,248.43,486.625L248.43,493.375" id="my-svg-L_K_R_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_K_R_0" data-points="W3sieCI6MzE5LjQyMzU4NDYzNjk5ODgsInkiOjM5My4xMTQ5OTA4ODY5OTg4fSx7IngiOjI0OC40Mjk2ODc1LCJ5Ijo0NTIuODc1fSx7IngiOjI0OC40Mjk2ODc1LCJ5Ijo0OTcuMzc1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M369.444,393.115L381.276,403.075C393.108,413.035,416.773,432.955,428.605,449.665C440.438,466.375,440.438,479.875,440.438,486.625L440.438,493.375" id="my-svg-L_K_SP_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_K_SP_0" data-points="W3sieCI6MzY5LjQ0MzYwMjg2MzAwMTIsInkiOjM5My4xMTQ5OTA4ODY5OTg4fSx7IngiOjQ0MC40Mzc1LCJ5Ijo0NTIuODc1fSx7IngiOjQ0MC40Mzc1LCJ5Ijo0OTcuMzc1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M381.341,381.218L429.486,393.161C477.631,405.103,573.921,428.989,622.066,446.057C670.211,463.125,670.211,473.375,670.211,478.5L670.211,483.625" id="my-svg-L_K_I_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_K_I_0" data-points="W3sieCI6MzgxLjM0MDg1ODIyNTg3MTE2LCJ5IjozODEuMjE3NzM1NTI0MTI4ODR9LHsieCI6NjcwLjIxMDkzNzUsInkiOjQ1Mi44NzV9LHsieCI6NjcwLjIxMDkzNzUsInkiOjQ4Ny42MjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M75.211,546.875L75.211,552.667C75.211,558.458,75.211,570.042,102.747,581.919C130.283,593.796,185.354,605.967,212.89,612.053L240.426,618.139" id="my-svg-L_U_F_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_U_F_0" data-points="W3sieCI6NzUuMjEwOTM3NSwieSI6NTQ2Ljg3NX0seyJ4Ijo3NS4yMTA5Mzc1LCJ5Ijo1ODEuNjI1fSx7IngiOjI0NC4zMzIwMzEyNSwieSI6NjE5LjAwMTg4ODAzMTIyNDF9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M248.43,546.875L248.43,552.667C248.43,558.458,248.43,570.042,254.586,579.649C260.742,589.256,273.055,596.887,279.211,600.702L285.367,604.518" id="my-svg-L_R_F_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_R_F_0" data-points="W3sieCI6MjQ4LjQyOTY4NzUsInkiOjU0Ni44NzV9LHsieCI6MjQ4LjQyOTY4NzUsInkiOjU4MS42MjV9LHsieCI6Mjg4Ljc2NzQ2MzIzNTI5NDE0LCJ5Ijo2MDYuNjI1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M440.438,546.875L440.438,552.667C440.438,558.458,440.438,570.042,434.281,579.649C428.125,589.256,415.812,596.887,409.656,600.702L403.5,604.518" id="my-svg-L_SP_F_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_SP_F_0" data-points="W3sieCI6NDQwLjQzNzUsInkiOjU0Ni44NzV9LHsieCI6NDQwLjQzNzUsInkiOjU4MS42MjV9LHsieCI6NDAwLjA5OTcyNDI2NDcwNTg2LCJ5Ijo2MDYuNjI1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M670.211,556.625L670.211,560.792C670.211,564.958,670.211,573.292,633.254,584.208C596.297,595.125,522.384,608.624,485.427,615.374L448.47,622.124" id="my-svg-L_I_F_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_I_F_0" data-points="W3sieCI6NjcwLjIxMDkzNzUsInkiOjU1Ni42MjV9LHsieCI6NjcwLjIxMDkzNzUsInkiOjU4MS42MjV9LHsieCI6NDQ0LjUzNTE1NjI1LCJ5Ijo2MjIuODQyNDQyNjU1MTg3N31d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M344.434,675.625L344.434,679.792C344.434,683.958,344.434,692.292,344.434,699.958C344.434,707.625,344.434,714.625,344.434,718.125L344.434,721.625" id="my-svg-L_F_E_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_F_E_0" data-points="W3sieCI6MzQ0LjQzMzU5Mzc1LCJ5Ijo2NzUuNjI1fSx7IngiOjM0NC40MzM1OTM3NSwieSI6NzAwLjYyNX0seyJ4IjozNDQuNDMzNTkzNzUsInkiOjcyNS42MjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel"><g class="label" data-id="L_A_V_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_V_D_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_D_K_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(75.2109375, 452.875)"><g class="label" data-id="L_K_U_0" transform="translate(-15.5390625, -9.75)"><foreignObject width="31.078125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>value</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(248.4296875, 452.875)"><g class="label" data-id="L_K_R_0" transform="translate(-27.453125, -9.75)"><foreignObject width="54.90625" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>transform</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(440.4375, 452.875)"><g class="label" data-id="L_K_SP_0" transform="translate(-39.0234375, -9.75)"><foreignObject width="78.046875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>specialisation</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(670.2109375, 452.875)"><g class="label" data-id="L_K_I_0" transform="translate(-25.2890625, -9.75)"><foreignObject width="50.578125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>structure</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_U_F_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_R_F_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_SP_F_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_I_F_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_F_E_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="my-svg-flowchart-A-0" data-look="classic" transform="translate(344.43359375, 32.75)"><rect class="basic label-container" style="" x="-113.4609375" y="-24.75" width="226.921875" height="49.5"/><g class="label" style="" transform="translate(-83.4609375, -9.75)"><rect/><foreignObject width="166.921875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>handle write, add, remove, tx</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-V-1" data-look="classic" transform="translate(344.43359375, 142)"><rect class="basic label-container" style="" x="-95.75" y="-34.5" width="191.5" height="69"/><g class="label" style="" transform="translate(-65.75, -19.5)"><rect/><foreignObject width="131.5" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>validate<br />units, ranges, allow-list</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-D-3" data-look="classic" transform="translate(344.43359375, 251.25)"><rect class="basic label-container" style="" x="-46.859375" y="-24.75" width="93.71875" height="49.5"/><g class="label" style="" transform="translate(-16.859375, -9.75)"><rect/><foreignObject width="33.71875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>IR diff</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-K-5" data-look="classic" transform="translate(344.43359375, 372.0625)"><polygon points="46.0625,0 92.125,-46.0625 46.0625,-92.125 0,-46.0625" class="label-container" transform="translate(-45.5625, 46.0625)"/><g class="label" style="" transform="translate(-21.3125, -9.75)"><rect/><foreignObject width="42.625" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>classify</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-U-7" data-look="classic" transform="translate(75.2109375, 522.125)"><rect class="basic label-container" style="" x="-67.2109375" y="-24.75" width="134.421875" height="49.5"/><g class="label" style="" transform="translate(-37.2109375, -9.75)"><rect/><foreignObject width="74.421875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>uniform write</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-R-9" data-look="classic" transform="translate(248.4296875, 522.125)"><rect class="basic label-container" style="" x="-56.0078125" y="-24.75" width="112.015625" height="49.5"/><g class="label" style="" transform="translate(-26.0078125, -9.75)"><rect/><foreignObject width="52.015625" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>BVH refit</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-SP-11" data-look="classic" transform="translate(440.4375, 522.125)"><rect class="basic label-container" style="" x="-86" y="-24.75" width="172" height="49.5"/><g class="label" style="" transform="translate(-56, -9.75)"><rect/><foreignObject width="112" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>kernel variant swap</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-I-13" data-look="classic" transform="translate(670.2109375, 522.125)"><rect class="basic label-container" style="" x="-93.7734375" y="-34.5" width="187.546875" height="69"/><g class="label" style="" transform="translate(-63.7734375, -19.5)"><rect/><foreignObject width="127.546875" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>incremental compile<br />+ subtree BVH rebuild</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-F-15" data-look="classic" transform="translate(344.43359375, 641.125)"><rect class="basic label-container" style="" x="-100.1015625" y="-34.5" width="200.203125" height="69"/><g class="label" style="" transform="translate(-70.1015625, -19.5)"><rect/><foreignObject width="140.203125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>apply at frame boundary<br />reset accumulation</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-E-23" data-look="classic" transform="translate(344.43359375, 750.375)"><rect class="basic label-container" style="" x="-106.421875" y="-24.75" width="212.84375" height="49.5"/><g class="label" style="" transform="translate(-76.421875, -9.75)"><rect/><foreignObject width="152.84375" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>patch event + history entry</p></span></div></foreignObject></g></g></g></g></g><defs><filter id="my-svg-drop-shadow" height="130%" width="130%"><feDropShadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><defs><filter id="my-svg-drop-shadow-small" height="150%" width="150%"><feDropShadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><linearGradient id="my-svg-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="hsl(0, 0%, 83.3333333333%)" stop-opacity="1"/><stop offset="100%" stop-color="hsl(0, 0%, 88.9215686275%)" stop-opacity="1"/></linearGradient></svg>
```

**Behaviours are run-stage lambdas declared at build time.** Compare them with *traced* animation:

```js
// stage ③: JS on the host, once per frame
const fanHost = shape.mesh('fan.glb').id('fan')
  .behavior((self, { dt }) => { self.rotation.y += dt * 2 * Math.PI * 3; });   // 3 rev/s

// stage ②: traced; evaluated at each path's *sampled time* inside the shutter interval
const fanTraced = shape.mesh('fan.glb').rotateY(fx.time().mul(2 * Math.PI * 3));
```

Motion blur is the `∫_T` in the measurement equation. A traced transform is evaluated at the time each sample is taken, so the blur is exact: an arc. A host behaviour provides one key per frame, and the engine interpolates between keys, which blurs along a chord:

```text
ⓘ I520  '#fan' rotates 18° per frame from a host behaviour; motion blur interpolates linearly between
        frame keys. For exact blur use a traced transform: .rotateY(fx.time().mul(…))
```

**Events:**

```js
world.on('pick', ({ hit }) => { hit.node.material.baseColor = '#ffcc00'; });
world.on('converged', ({ spp }) => console.log(`converged at ${spp} spp`));
world.on('patch', p => socket.send(JSON.stringify(p)));   // patches serialise → multi-user, remote agents
```

---

### L16 — Agents in the loop

An agent sees the world the way a lighting technician does: an image, **meter readings** and a scene summary with stable IDs. It acts through the same proxied grammar, so every action is validated, typed and unit-checked. **Errors come back as data** rather than exceptions, so an LLM can read them and correct itself.

```js
const session = world.agent({
  allow: ['light.*', 'camera.exposure', 'camera.fstop', 'add:light.area', 'add:light.spot', 'remove:light.*'],
  deny:  ['material.*', 'shape.*'],                // it may light the bust, never repaint or move it
  budget: { actions: 60, renderMs: 20_000 },
  probes: {
    litCheek:    { at: '#bust/cheek.L', measure: 'illuminance' },   // anchor points authored in the asset
    shadowCheek: { at: '#bust/cheek.R', measure: 'illuminance' },
    backdrop:    { at: '#backdrop', measure: 'luminance' },
  },
});

session.tools();   // JSON schemas derived from the grammar, the allow-list and param ranges
```

```json
[
  { "name": "set",
    "description": "Set an attribute. Values accept units: '1200 lm', '35 deg', '5600 K', 'f/4'.",
    "input_schema": { "type": "object", "required": ["target", "value"], "properties": {
      "target": { "type": "string", "pattern": "^#[\\w-]+\\.(power|temperature|position|rotation|cone|size)$" },
      "value":  { "type": ["string", "number", "array"] } } } },
  { "name": "add_light", "input_schema": { "type": "object", "required": ["kind", "id"], "properties": {
      "kind": { "enum": ["area", "spot"] }, "id": { "type": "string" }, "at": { "type": "array" } } } },
  { "name": "meter",   "input_schema": { "type": "object", "properties": { "probes": { "type": "array" } } } },
  { "name": "observe", "input_schema": { "type": "object", "properties": { "falseColor": { "type": "boolean" } } } },
  { "name": "fork" }, { "name": "commit" }, { "name": "rollback" }
]
```

**A scripted agent that uses the physics directly.** Light transport is linear in emission (Part I §5). Measure, once, how many lux each light delivers to each probe per lumen. Hitting a target is then a 2 × 2 linear solve, with no trial and error:

```js
const solve2x2 = ([[a, b], [c, d]], [e, f]) => {
  const det = a * d - b * c;
  return [(e * d - b * f) / det, (a * f - e * c) / det];
};

// A[i][j] = lux at probe i per lumen emitted by light j   (two renders, one per light)
const A = await session.measure.transport({ lights: ['#key', '#fill'], probes: ['litCheek', 'shadowCheek'] });

const target = [500, 500 / 3];                     // 500 lx on the lit cheek, 3:1 lighting ratio (≈ 1.58 stops)
const [key, fill] = solve2x2(A, target).map(x => Math.max(0, x));

const result = await session.act([
  { op: 'set', target: '#key.power',  value: `${key.toFixed(0)} lm` },
  { op: 'set', target: '#fill.power', value: `${fill.toFixed(0)} lm` },
]);
```

**An LLM agent for open-ended goals** ("make it feel like a 1940s film noir still"). The loop is generic because the grammar provides the tools:

```js
const SYSTEM = `You are a lighting assistant. Work in physical units. Meter before and after each change.
Prefer few, decisive changes. Stop when the goal is met and explain the result in one paragraph.`;

export async function runAgent(session, goal, llm) {
  const history = [{ role: 'user', content: goal }];
  for (let turn = 0; turn < 20; turn++) {
    const obs = await session.observe({ image: { size: 512, spp: 32 }, falseColor: true, meters: true, scene: 'summary' });
    history.push({ role: 'user', content: obs.asContent() });          // image + meters + ids as content blocks
    const reply = await llm.chat({ system: SYSTEM, tools: session.tools(), messages: history });
    history.push(reply.message);
    if (reply.toolCalls.length === 0) { await session.commit(); return reply.text; }
    for (const call of reply.toolCalls) {
      const result = await session.act(call);                          // never throws
      history.push({ role: 'tool', id: call.id, content: result.asContent() });
    }
  }
  await session.rollback('budget exhausted');
  return 'Stopped: budget exhausted, changes rolled back.';
}
```

**Results are data.** These are what the model reads back:

```json
[
  { "ok": false, "code": "E104", "message": "light '#key' has no attribute 'brightness'",
    "suggest": ["power", "intensity", "temperature"], "hint": "power accepts '1200 lm' or a number in lm" },

  { "ok": false, "code": "E901", "message": "'#bust.material.baseColor' is outside this session's allow-list (material.* is denied)" },

  { "ok": true, "cost": "value", "diff": [{ "path": "#key.power", "from": "800 lm", "to": "1240 lm" }],
    "meters": { "litCheek": "498 lx", "shadowCheek": "171 lx", "ratio": "2.91:1" } }
]
```

**Counterfactuals are cheap.** `fork()` is O(1) because the IR is persistent, so an agent can try alternatives side by side:

```js
const variants = await Promise.all(['softbox', 'umbrella', 'bare'].map(async modifier => {
  const f = session.fork();
  await f.act({ op: 'set', target: '#key.modifier', value: modifier });
  return { modifier, fork: f, obs: await f.observe({ image: { size: 256, spp: 16 } }) };
}));
// the agent (or a person) picks one; that fork is committed and the others are dropped
```

**Relighting by superposition.** One basis image per light lets an agent or a UI preview *any* combination of powers instantly. The result is exact for power changes; moving a light needs a new render.

```js
const basis = await session.observe({ basis: 'lights', spp: 256 });
const preview = basis.combine({ '#key': 1240, '#fill': 410, '#rim': 900 });   // lumens → image, no render
```

```diagram
<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 1017px; background-color: transparent;" viewBox="-50 -10 1017 760" role="graphics-document document" aria-roledescription="sequence"><g><rect x="767" y="674" fill="#eaeaea" stroke="#666" width="150" height="65" name="E" rx="3" ry="3" class="actor actor-bottom"/><text x="842" y="706.5" dominant-baseline="central" alignment-baseline="central" class="actor actor-box" style="text-anchor: middle; font-size: 16px; font-weight: 400;"><tspan x="842" dy="0">Engine</tspan></text></g><g><rect x="567" y="674" fill="#eaeaea" stroke="#666" width="150" height="65" name="W" rx="3" ry="3" class="actor actor-bottom"/><text x="642" y="706.5" dominant-baseline="central" alignment-baseline="central" class="actor actor-box" style="text-anchor: middle; font-size: 16px; font-weight: 400;"><tspan x="642" dy="0">World</tspan></text></g><g><rect x="348" y="674" fill="#eaeaea" stroke="#666" width="150" height="65" name="S" rx="3" ry="3" class="actor actor-bottom"/><text x="423" y="706.5" dominant-baseline="central" alignment-baseline="central" class="actor actor-box" style="text-anchor: middle; font-size: 16px; font-weight: 400;"><tspan x="423" dy="0">AgentSession</tspan></text></g><g><rect x="0" y="674" fill="#eaeaea" stroke="#666" width="164" height="65" name="A" rx="3" ry="3" class="actor actor-bottom"/><text x="82" y="706.5" dominant-baseline="central" alignment-baseline="central" class="actor actor-box" style="text-anchor: middle; font-size: 16px; font-weight: 400;"><tspan x="82" dy="0">Agent (LLM or script)</tspan></text></g><g><line id="actor3" x1="842" y1="65" x2="842" y2="674" class="actor-line 200" stroke-width="0.5px" stroke="#999" name="E" data-et="life-line" data-id="E"/><g id="root-3" data-et="participant" data-type="participant" data-id="E"><rect x="767" y="0" fill="#eaeaea" stroke="#666" width="150" height="65" name="E" rx="3" ry="3" class="actor actor-top"/><text x="842" y="32.5" dominant-baseline="central" alignment-baseline="central" class="actor actor-box" style="text-anchor: middle; font-size: 16px; font-weight: 400;"><tspan x="842" dy="0">Engine</tspan></text></g></g><g><line id="actor2" x1="642" y1="65" x2="642" y2="674" class="actor-line 200" stroke-width="0.5px" stroke="#999" name="W" data-et="life-line" data-id="W"/><g id="root-2" data-et="participant" data-type="participant" data-id="W"><rect x="567" y="0" fill="#eaeaea" stroke="#666" width="150" height="65" name="W" rx="3" ry="3" class="actor actor-top"/><text x="642" y="32.5" dominant-baseline="central" alignment-baseline="central" class="actor actor-box" style="text-anchor: middle; font-size: 16px; font-weight: 400;"><tspan x="642" dy="0">World</tspan></text></g></g><g><line id="actor1" x1="423" y1="65" x2="423" y2="674" class="actor-line 200" stroke-width="0.5px" stroke="#999" name="S" data-et="life-line" data-id="S"/><g id="root-1" data-et="participant" data-type="participant" data-id="S"><rect x="348" y="0" fill="#eaeaea" stroke="#666" width="150" height="65" name="S" rx="3" ry="3" class="actor actor-top"/><text x="423" y="32.5" dominant-baseline="central" alignment-baseline="central" class="actor actor-box" style="text-anchor: middle; font-size: 16px; font-weight: 400;"><tspan x="423" dy="0">AgentSession</tspan></text></g></g><g><line id="actor0" x1="82" y1="65" x2="82" y2="674" class="actor-line 200" stroke-width="0.5px" stroke="#999" name="A" data-et="life-line" data-id="A"/><g id="root-0" data-et="participant" data-type="participant" data-id="A"><rect x="0" y="0" fill="#eaeaea" stroke="#666" width="164" height="65" name="A" rx="3" ry="3" class="actor actor-top"/><text x="82" y="32.5" dominant-baseline="central" alignment-baseline="central" class="actor actor-box" style="text-anchor: middle; font-size: 16px; font-weight: 400;"><tspan x="82" dy="0">Agent (LLM or script)</tspan></text></g></g><style>#my-svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;fill:#000000;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#552222;}#my-svg .error-text{fill:#552222;stroke:#552222;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#737373;stroke:#737373;}#my-svg .marker.cross{stroke:#737373;}#my-svg svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;}#my-svg p{margin:0;}#my-svg .actor{stroke:hsl(0, 0%, 83%);fill:#eee;stroke-width:1;}#my-svg rect.actor.outer-path[data-look="neo"]{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg rect.note[data-look="neo"]{stroke:#999;fill:#666;filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg text.actor&gt;tspan{fill:#333;stroke:none;}#my-svg .actor-line{stroke:hsl(0, 0%, 83%);}#my-svg .innerArc{stroke-width:1.5;stroke-dasharray:none;}#my-svg .messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:#333;}#my-svg .messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:#333;}#my-svg [id$="-arrowhead"] path{fill:#333;stroke:#333;}#my-svg .sequenceNumber{fill:white;}#my-svg [id$="-sequencenumber"]{fill:#333;}#my-svg [id$="-crosshead"] path{fill:#333;stroke:#333;}#my-svg .messageText{fill:#333;stroke:none;}#my-svg .labelBox{stroke:hsl(0, 0%, 83%);fill:#eee;filter:none;}#my-svg .labelText,#my-svg .labelText&gt;tspan{fill:#333;stroke:none;}#my-svg .loopText,#my-svg .loopText&gt;tspan{fill:#333;stroke:none;}#my-svg .sectionTitle,#my-svg .sectionTitle&gt;tspan{fill:#333;stroke:none;}#my-svg .loopLine{stroke-width:2px;stroke-dasharray:2,2;stroke:hsl(0, 0%, 83%);fill:hsl(0, 0%, 83%);}#my-svg .note{stroke:#999;fill:#666;}#my-svg .noteText,#my-svg .noteText&gt;tspan{fill:#fff;stroke:none;font-weight:normal;}#my-svg .activation0{fill:#f4f4f4;stroke:#666;}#my-svg .activation1{fill:#f4f4f4;stroke:#666;}#my-svg .activation2{fill:#f4f4f4;stroke:#666;}#my-svg .actorPopupMenu{position:absolute;}#my-svg .actorPopupMenuPanel{position:absolute;fill:#eee;box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2);filter:drop-shadow(3px 5px 2px rgb(0 0 0 / 0.4));}#my-svg .actor-man circle,#my-svg line{fill:#eee;stroke-width:2px;}#my-svg g rect.rect{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));stroke:#999;}#my-svg .node .neo-node{stroke:#999;}#my-svg [data-look="neo"].node rect,#my-svg [data-look="neo"].cluster rect,#my-svg [data-look="neo"].node polygon{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].swimlane.cluster rect{filter:none;}#my-svg [data-look="neo"].node path{stroke:url(#my-svg-gradient);stroke-width:1px;}#my-svg [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node .neo-line path{stroke:#999;filter:none;}#my-svg [data-look="neo"].node circle{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node circle .state-start{fill:#000000;}#my-svg [data-look="neo"].icon-shape .icon{fill:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].icon-shape .icon-neo path{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g/><defs><symbol id="my-svg-computer" width="24" height="24"><path transform="scale(.5)" d="M2 2v13h20v-13h-20zm18 11h-16v-9h16v9zm-10.228 6l.466-1h3.524l.467 1h-4.457zm14.228 3h-24l2-6h2.104l-1.33 4h18.45l-1.297-4h2.073l2 6zm-5-10h-14v-7h14v7z"/></symbol></defs><defs><symbol id="my-svg-database" fill-rule="evenodd" clip-rule="evenodd"><path transform="scale(.5)" d="M12.258.001l.256.004.255.005.253.008.251.01.249.012.247.015.246.016.242.019.241.02.239.023.236.024.233.027.231.028.229.031.225.032.223.034.22.036.217.038.214.04.211.041.208.043.205.045.201.046.198.048.194.05.191.051.187.053.183.054.18.056.175.057.172.059.168.06.163.061.16.063.155.064.15.066.074.033.073.033.071.034.07.034.069.035.068.035.067.035.066.035.064.036.064.036.062.036.06.036.06.037.058.037.058.037.055.038.055.038.053.038.052.038.051.039.05.039.048.039.047.039.045.04.044.04.043.04.041.04.04.041.039.041.037.041.036.041.034.041.033.042.032.042.03.042.029.042.027.042.026.043.024.043.023.043.021.043.02.043.018.044.017.043.015.044.013.044.012.044.011.045.009.044.007.045.006.045.004.045.002.045.001.045v17l-.001.045-.002.045-.004.045-.006.045-.007.045-.009.044-.011.045-.012.044-.013.044-.015.044-.017.043-.018.044-.02.043-.021.043-.023.043-.024.043-.026.043-.027.042-.029.042-.03.042-.032.042-.033.042-.034.041-.036.041-.037.041-.039.041-.04.041-.041.04-.043.04-.044.04-.045.04-.047.039-.048.039-.05.039-.051.039-.052.038-.053.038-.055.038-.055.038-.058.037-.058.037-.06.037-.06.036-.062.036-.064.036-.064.036-.066.035-.067.035-.068.035-.069.035-.07.034-.071.034-.073.033-.074.033-.15.066-.155.064-.16.063-.163.061-.168.06-.172.059-.175.057-.18.056-.183.054-.187.053-.191.051-.194.05-.198.048-.201.046-.205.045-.208.043-.211.041-.214.04-.217.038-.22.036-.223.034-.225.032-.229.031-.231.028-.233.027-.236.024-.239.023-.241.02-.242.019-.246.016-.247.015-.249.012-.251.01-.253.008-.255.005-.256.004-.258.001-.258-.001-.256-.004-.255-.005-.253-.008-.251-.01-.249-.012-.247-.015-.245-.016-.243-.019-.241-.02-.238-.023-.236-.024-.234-.027-.231-.028-.228-.031-.226-.032-.223-.034-.22-.036-.217-.038-.214-.04-.211-.041-.208-.043-.204-.045-.201-.046-.198-.048-.195-.05-.19-.051-.187-.053-.184-.054-.179-.056-.176-.057-.172-.059-.167-.06-.164-.061-.159-.063-.155-.064-.151-.066-.074-.033-.072-.033-.072-.034-.07-.034-.069-.035-.068-.035-.067-.035-.066-.035-.064-.036-.063-.036-.062-.036-.061-.036-.06-.037-.058-.037-.057-.037-.056-.038-.055-.038-.053-.038-.052-.038-.051-.039-.049-.039-.049-.039-.046-.039-.046-.04-.044-.04-.043-.04-.041-.04-.04-.041-.039-.041-.037-.041-.036-.041-.034-.041-.033-.042-.032-.042-.03-.042-.029-.042-.027-.042-.026-.043-.024-.043-.023-.043-.021-.043-.02-.043-.018-.044-.017-.043-.015-.044-.013-.044-.012-.044-.011-.045-.009-.044-.007-.045-.006-.045-.004-.045-.002-.045-.001-.045v-17l.001-.045.002-.045.004-.045.006-.045.007-.045.009-.044.011-.045.012-.044.013-.044.015-.044.017-.043.018-.044.02-.043.021-.043.023-.043.024-.043.026-.043.027-.042.029-.042.03-.042.032-.042.033-.042.034-.041.036-.041.037-.041.039-.041.04-.041.041-.04.043-.04.044-.04.046-.04.046-.039.049-.039.049-.039.051-.039.052-.038.053-.038.055-.038.056-.038.057-.037.058-.037.06-.037.061-.036.062-.036.063-.036.064-.036.066-.035.067-.035.068-.035.069-.035.07-.034.072-.034.072-.033.074-.033.151-.066.155-.064.159-.063.164-.061.167-.06.172-.059.176-.057.179-.056.184-.054.187-.053.19-.051.195-.05.198-.048.201-.046.204-.045.208-.043.211-.041.214-.04.217-.038.22-.036.223-.034.226-.032.228-.031.231-.028.234-.027.236-.024.238-.023.241-.02.243-.019.245-.016.247-.015.249-.012.251-.01.253-.008.255-.005.256-.004.258-.001.258.001zm-9.258 20.499v.01l.001.021.003.021.004.022.005.021.006.022.007.022.009.023.01.022.011.023.012.023.013.023.015.023.016.024.017.023.018.024.019.024.021.024.022.025.023.024.024.025.052.049.056.05.061.051.066.051.07.051.075.051.079.052.084.052.088.052.092.052.097.052.102.051.105.052.11.052.114.051.119.051.123.051.127.05.131.05.135.05.139.048.144.049.147.047.152.047.155.047.16.045.163.045.167.043.171.043.176.041.178.041.183.039.187.039.19.037.194.035.197.035.202.033.204.031.209.03.212.029.216.027.219.025.222.024.226.021.23.02.233.018.236.016.24.015.243.012.246.01.249.008.253.005.256.004.259.001.26-.001.257-.004.254-.005.25-.008.247-.011.244-.012.241-.014.237-.016.233-.018.231-.021.226-.021.224-.024.22-.026.216-.027.212-.028.21-.031.205-.031.202-.034.198-.034.194-.036.191-.037.187-.039.183-.04.179-.04.175-.042.172-.043.168-.044.163-.045.16-.046.155-.046.152-.047.148-.048.143-.049.139-.049.136-.05.131-.05.126-.05.123-.051.118-.052.114-.051.11-.052.106-.052.101-.052.096-.052.092-.052.088-.053.083-.051.079-.052.074-.052.07-.051.065-.051.06-.051.056-.05.051-.05.023-.024.023-.025.021-.024.02-.024.019-.024.018-.024.017-.024.015-.023.014-.024.013-.023.012-.023.01-.023.01-.022.008-.022.006-.022.006-.022.004-.022.004-.021.001-.021.001-.021v-4.127l-.077.055-.08.053-.083.054-.085.053-.087.052-.09.052-.093.051-.095.05-.097.05-.1.049-.102.049-.105.048-.106.047-.109.047-.111.046-.114.045-.115.045-.118.044-.12.043-.122.042-.124.042-.126.041-.128.04-.13.04-.132.038-.134.038-.135.037-.138.037-.139.035-.142.035-.143.034-.144.033-.147.032-.148.031-.15.03-.151.03-.153.029-.154.027-.156.027-.158.026-.159.025-.161.024-.162.023-.163.022-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.011-.178.01-.179.008-.179.008-.181.006-.182.005-.182.004-.184.003-.184.002h-.37l-.184-.002-.184-.003-.182-.004-.182-.005-.181-.006-.179-.008-.179-.008-.178-.01-.176-.011-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.022-.162-.023-.161-.024-.159-.025-.157-.026-.156-.027-.155-.027-.153-.029-.151-.03-.15-.03-.148-.031-.146-.032-.145-.033-.143-.034-.141-.035-.14-.035-.137-.037-.136-.037-.134-.038-.132-.038-.13-.04-.128-.04-.126-.041-.124-.042-.122-.042-.12-.044-.117-.043-.116-.045-.113-.045-.112-.046-.109-.047-.106-.047-.105-.048-.102-.049-.1-.049-.097-.05-.095-.05-.093-.052-.09-.051-.087-.052-.085-.053-.083-.054-.08-.054-.077-.054v4.127zm0-5.654v.011l.001.021.003.021.004.021.005.022.006.022.007.022.009.022.01.022.011.023.012.023.013.023.015.024.016.023.017.024.018.024.019.024.021.024.022.024.023.025.024.024.052.05.056.05.061.05.066.051.07.051.075.052.079.051.084.052.088.052.092.052.097.052.102.052.105.052.11.051.114.051.119.052.123.05.127.051.131.05.135.049.139.049.144.048.147.048.152.047.155.046.16.045.163.045.167.044.171.042.176.042.178.04.183.04.187.038.19.037.194.036.197.034.202.033.204.032.209.03.212.028.216.027.219.025.222.024.226.022.23.02.233.018.236.016.24.014.243.012.246.01.249.008.253.006.256.003.259.001.26-.001.257-.003.254-.006.25-.008.247-.01.244-.012.241-.015.237-.016.233-.018.231-.02.226-.022.224-.024.22-.025.216-.027.212-.029.21-.03.205-.032.202-.033.198-.035.194-.036.191-.037.187-.039.183-.039.179-.041.175-.042.172-.043.168-.044.163-.045.16-.045.155-.047.152-.047.148-.048.143-.048.139-.05.136-.049.131-.05.126-.051.123-.051.118-.051.114-.052.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.051.07-.052.065-.051.06-.05.056-.051.051-.049.023-.025.023-.024.021-.025.02-.024.019-.024.018-.024.017-.024.015-.023.014-.023.013-.024.012-.022.01-.023.01-.023.008-.022.006-.022.006-.022.004-.021.004-.022.001-.021.001-.021v-4.139l-.077.054-.08.054-.083.054-.085.052-.087.053-.09.051-.093.051-.095.051-.097.05-.1.049-.102.049-.105.048-.106.047-.109.047-.111.046-.114.045-.115.044-.118.044-.12.044-.122.042-.124.042-.126.041-.128.04-.13.039-.132.039-.134.038-.135.037-.138.036-.139.036-.142.035-.143.033-.144.033-.147.033-.148.031-.15.03-.151.03-.153.028-.154.028-.156.027-.158.026-.159.025-.161.024-.162.023-.163.022-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.011-.178.009-.179.009-.179.007-.181.007-.182.005-.182.004-.184.003-.184.002h-.37l-.184-.002-.184-.003-.182-.004-.182-.005-.181-.007-.179-.007-.179-.009-.178-.009-.176-.011-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.022-.162-.023-.161-.024-.159-.025-.157-.026-.156-.027-.155-.028-.153-.028-.151-.03-.15-.03-.148-.031-.146-.033-.145-.033-.143-.033-.141-.035-.14-.036-.137-.036-.136-.037-.134-.038-.132-.039-.13-.039-.128-.04-.126-.041-.124-.042-.122-.043-.12-.043-.117-.044-.116-.044-.113-.046-.112-.046-.109-.046-.106-.047-.105-.048-.102-.049-.1-.049-.097-.05-.095-.051-.093-.051-.09-.051-.087-.053-.085-.052-.083-.054-.08-.054-.077-.054v4.139zm0-5.666v.011l.001.02.003.022.004.021.005.022.006.021.007.022.009.023.01.022.011.023.012.023.013.023.015.023.016.024.017.024.018.023.019.024.021.025.022.024.023.024.024.025.052.05.056.05.061.05.066.051.07.051.075.052.079.051.084.052.088.052.092.052.097.052.102.052.105.051.11.052.114.051.119.051.123.051.127.05.131.05.135.05.139.049.144.048.147.048.152.047.155.046.16.045.163.045.167.043.171.043.176.042.178.04.183.04.187.038.19.037.194.036.197.034.202.033.204.032.209.03.212.028.216.027.219.025.222.024.226.021.23.02.233.018.236.017.24.014.243.012.246.01.249.008.253.006.256.003.259.001.26-.001.257-.003.254-.006.25-.008.247-.01.244-.013.241-.014.237-.016.233-.018.231-.02.226-.022.224-.024.22-.025.216-.027.212-.029.21-.03.205-.032.202-.033.198-.035.194-.036.191-.037.187-.039.183-.039.179-.041.175-.042.172-.043.168-.044.163-.045.16-.045.155-.047.152-.047.148-.048.143-.049.139-.049.136-.049.131-.051.126-.05.123-.051.118-.052.114-.051.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.052.07-.051.065-.051.06-.051.056-.05.051-.049.023-.025.023-.025.021-.024.02-.024.019-.024.018-.024.017-.024.015-.023.014-.024.013-.023.012-.023.01-.022.01-.023.008-.022.006-.022.006-.022.004-.022.004-.021.001-.021.001-.021v-4.153l-.077.054-.08.054-.083.053-.085.053-.087.053-.09.051-.093.051-.095.051-.097.05-.1.049-.102.048-.105.048-.106.048-.109.046-.111.046-.114.046-.115.044-.118.044-.12.043-.122.043-.124.042-.126.041-.128.04-.13.039-.132.039-.134.038-.135.037-.138.036-.139.036-.142.034-.143.034-.144.033-.147.032-.148.032-.15.03-.151.03-.153.028-.154.028-.156.027-.158.026-.159.024-.161.024-.162.023-.163.023-.165.021-.166.02-.167.019-.169.018-.169.017-.171.016-.173.015-.173.014-.175.013-.175.012-.177.01-.178.01-.179.009-.179.007-.181.006-.182.006-.182.004-.184.003-.184.001-.185.001-.185-.001-.184-.001-.184-.003-.182-.004-.182-.006-.181-.006-.179-.007-.179-.009-.178-.01-.176-.01-.176-.012-.175-.013-.173-.014-.172-.015-.171-.016-.17-.017-.169-.018-.167-.019-.166-.02-.165-.021-.163-.023-.162-.023-.161-.024-.159-.024-.157-.026-.156-.027-.155-.028-.153-.028-.151-.03-.15-.03-.148-.032-.146-.032-.145-.033-.143-.034-.141-.034-.14-.036-.137-.036-.136-.037-.134-.038-.132-.039-.13-.039-.128-.041-.126-.041-.124-.041-.122-.043-.12-.043-.117-.044-.116-.044-.113-.046-.112-.046-.109-.046-.106-.048-.105-.048-.102-.048-.1-.05-.097-.049-.095-.051-.093-.051-.09-.052-.087-.052-.085-.053-.083-.053-.08-.054-.077-.054v4.153zm8.74-8.179l-.257.004-.254.005-.25.008-.247.011-.244.012-.241.014-.237.016-.233.018-.231.021-.226.022-.224.023-.22.026-.216.027-.212.028-.21.031-.205.032-.202.033-.198.034-.194.036-.191.038-.187.038-.183.04-.179.041-.175.042-.172.043-.168.043-.163.045-.16.046-.155.046-.152.048-.148.048-.143.048-.139.049-.136.05-.131.05-.126.051-.123.051-.118.051-.114.052-.11.052-.106.052-.101.052-.096.052-.092.052-.088.052-.083.052-.079.052-.074.051-.07.052-.065.051-.06.05-.056.05-.051.05-.023.025-.023.024-.021.024-.02.025-.019.024-.018.024-.017.023-.015.024-.014.023-.013.023-.012.023-.01.023-.01.022-.008.022-.006.023-.006.021-.004.022-.004.021-.001.021-.001.021.001.021.001.021.004.021.004.022.006.021.006.023.008.022.01.022.01.023.012.023.013.023.014.023.015.024.017.023.018.024.019.024.02.025.021.024.023.024.023.025.051.05.056.05.06.05.065.051.07.052.074.051.079.052.083.052.088.052.092.052.096.052.101.052.106.052.11.052.114.052.118.051.123.051.126.051.131.05.136.05.139.049.143.048.148.048.152.048.155.046.16.046.163.045.168.043.172.043.175.042.179.041.183.04.187.038.191.038.194.036.198.034.202.033.205.032.21.031.212.028.216.027.22.026.224.023.226.022.231.021.233.018.237.016.241.014.244.012.247.011.25.008.254.005.257.004.26.001.26-.001.257-.004.254-.005.25-.008.247-.011.244-.012.241-.014.237-.016.233-.018.231-.021.226-.022.224-.023.22-.026.216-.027.212-.028.21-.031.205-.032.202-.033.198-.034.194-.036.191-.038.187-.038.183-.04.179-.041.175-.042.172-.043.168-.043.163-.045.16-.046.155-.046.152-.048.148-.048.143-.048.139-.049.136-.05.131-.05.126-.051.123-.051.118-.051.114-.052.11-.052.106-.052.101-.052.096-.052.092-.052.088-.052.083-.052.079-.052.074-.051.07-.052.065-.051.06-.05.056-.05.051-.05.023-.025.023-.024.021-.024.02-.025.019-.024.018-.024.017-.023.015-.024.014-.023.013-.023.012-.023.01-.023.01-.022.008-.022.006-.023.006-.021.004-.022.004-.021.001-.021.001-.021-.001-.021-.001-.021-.004-.021-.004-.022-.006-.021-.006-.023-.008-.022-.01-.022-.01-.023-.012-.023-.013-.023-.014-.023-.015-.024-.017-.023-.018-.024-.019-.024-.02-.025-.021-.024-.023-.024-.023-.025-.051-.05-.056-.05-.06-.05-.065-.051-.07-.052-.074-.051-.079-.052-.083-.052-.088-.052-.092-.052-.096-.052-.101-.052-.106-.052-.11-.052-.114-.052-.118-.051-.123-.051-.126-.051-.131-.05-.136-.05-.139-.049-.143-.048-.148-.048-.152-.048-.155-.046-.16-.046-.163-.045-.168-.043-.172-.043-.175-.042-.179-.041-.183-.04-.187-.038-.191-.038-.194-.036-.198-.034-.202-.033-.205-.032-.21-.031-.212-.028-.216-.027-.22-.026-.224-.023-.226-.022-.231-.021-.233-.018-.237-.016-.241-.014-.244-.012-.247-.011-.25-.008-.254-.005-.257-.004-.26-.001-.26.001z"/></symbol></defs><defs><symbol id="my-svg-clock" width="24" height="24"><path transform="scale(.5)" d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm5.848 12.459c.202.038.202.333.001.372-1.907.361-6.045 1.111-6.547 1.111-.719 0-1.301-.582-1.301-1.301 0-.512.77-5.447 1.125-7.445.034-.192.312-.181.343.014l.985 6.238 5.394 1.011z"/></symbol></defs><defs><marker id="my-svg-arrowhead" refX="7.9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M -1 0 L 10 5 L 0 10 z"/></marker></defs><defs><marker id="my-svg-crosshead" markerWidth="15" markerHeight="8" orient="auto" refX="4" refY="4.5"><path fill="none" stroke="#000000" stroke-width="1pt" d="M 1,2 L 6,7 M 6,2 L 1,7" style="stroke-dasharray: 0, 0;"/></marker></defs><defs><marker id="my-svg-filled-head" refX="15.5" refY="7" markerWidth="20" markerHeight="28" orient="auto"><path d="M 18,7 L9,13 L14,7 L9,1 Z"/></marker></defs><defs><marker id="my-svg-sequencenumber" refX="15" refY="15" markerWidth="60" markerHeight="40" orient="auto"><circle cx="15" cy="15" r="6"/></marker></defs><defs><marker id="my-svg-solidTopArrowHead" refX="7.9" refY="7.25" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M 0 0 L 10 8 L 0 8 z"/></marker></defs><defs><marker id="my-svg-solidBottomArrowHead" refX="7.9" refY="0.75" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M 0 0 L 10 0 L 0 8 z"/></marker></defs><defs><marker id="my-svg-stickTopArrowHead" refX="7.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M 0 0 L 7 7" stroke="black" stroke-width="1.5" fill="none"/></marker></defs><defs><marker id="my-svg-stickBottomArrowHead" refX="7.5" refY="0" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M 0 7 L 7 0" stroke="black" stroke-width="1.5" fill="none"/></marker></defs><g data-et="control-structure" data-id="i11"><line x1="71" y1="167" x2="853" y2="167" class="loopLine"/><line x1="853" y1="167" x2="853" y2="608" class="loopLine"/><line x1="71" y1="608" x2="853" y2="608" class="loopLine"/><line x1="71" y1="167" x2="71" y2="608" class="loopLine"/><polygon points="71,167 121,167 121,180 112.6,187 71,187" class="labelBox"/><text x="96" y="180" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="labelText" style="font-size: 16px; font-weight: 400;">loop</text><text x="487" y="185" text-anchor="middle" class="loopText" style="font-size: 16px; font-weight: 400;"><tspan x="487">[until goal met or budget spent]</tspan></text></g><text x="251" y="80" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">tools()</text><line x1="83" y1="111" x2="419" y2="111" class="messageLine0" data-et="message" data-id="i0" data-from="A" data-to="S" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="fill: none;"/><text x="254" y="126" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">JSON schemas from grammar + allow-list</text><line x1="422" y1="157" x2="86" y2="157" class="messageLine1" data-et="message" data-id="i1" data-from="S" data-to="A" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="stroke-dasharray: 3, 3; fill: none;"/><text x="251" y="217" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">observe(image, meters, summary)</text><line x1="83" y1="248" x2="419" y2="248" class="messageLine0" data-et="message" data-id="i3" data-from="A" data-to="S" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="fill: none;"/><text x="631" y="263" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">preview render 512 px, 32 spp</text><line x1="424" y1="294" x2="838" y2="294" class="messageLine0" data-et="message" data-id="i4" data-from="S" data-to="E" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="fill: none;"/><text x="634" y="309" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">image + AOVs + probe readings</text><line x1="841" y1="340" x2="427" y2="340" class="messageLine1" data-et="message" data-id="i5" data-from="E" data-to="S" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="stroke-dasharray: 3, 3; fill: none;"/><text x="254" y="355" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">content blocks</text><line x1="422" y1="384" x2="86" y2="384" class="messageLine1" data-et="message" data-id="i6" data-from="S" data-to="A" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="stroke-dasharray: 3, 3; fill: none;"/><text x="251" y="399" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">act(set key.power to 1240 lm)</text><line x1="83" y1="430" x2="419" y2="430" class="messageLine0" data-et="message" data-id="i7" data-from="A" data-to="S" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="fill: none;"/><text x="424" y="445" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">validate units, ranges, allow-list</text><path d="M 424,476 C 484,466 484,506 424,496" class="messageLine0" data-et="message" data-id="i8" data-from="S" data-to="S" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="fill: none;"/><text x="531" y="521" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">patch (cost class value)</text><line x1="424" y1="552" x2="638" y2="552" class="messageLine0" data-et="message" data-id="i9" data-from="S" data-to="W" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="fill: none;"/><text x="254" y="567" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">ok, diff, new meter readings</text><line x1="422" y1="598" x2="86" y2="598" class="messageLine1" data-et="message" data-id="i10" data-from="S" data-to="A" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="stroke-dasharray: 3, 3; fill: none;"/><text x="251" y="623" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle" class="messageText" dy="1em" style="font-size: 16px; font-weight: 400;">commit()</text><line x1="83" y1="654" x2="419" y2="654" class="messageLine0" data-et="message" data-id="i12" data-from="A" data-to="S" stroke-width="2" stroke="none" marker-end="url(#my-svg-arrowhead)" style="fill: none;"/></svg>
```

---

### L17 — Inverse rendering

Run the pipeline backwards: given a photograph, find the parameters that reproduce it. Because the scene *and* the loss are traced IR, a differentiable backend can propagate gradients through the render.

```js
import { optimize, loss, image } from 'candela/optimize';

const P = params({
  sunElev:   param.angle(u.deg(40)).range(u.deg(5), u.deg(85)),
  sunAz:     param.angle(u.deg(180)).range(u.deg(0), u.deg(360)),
  turbidity: param.float(3).range(1, 10),
  wall:      param.color(0.5).role('reflectance'),
});

const courtyard = scene().params(P)
  .add(shape.mesh('courtyard.glb').part('walls', m => m.material(material.pbr().baseColor(P.wall).roughness(0.8))))
  .light(light.sun().elevation(P.sunElev).azimuth(P.sunAz).illuminance(P.sunElev.map(directNormalLux)))  // L4
  .light(light.sky.physical({ turbidity: P.turbidity }).fromSun())
  .camera(camera.fromPhoto('courtyard.exr'));      // intrinsics and exposure from metadata / calibration

const photo = await image.load('courtyard.exr', { colorSpace: 'linear-rec709' });

const fit = await optimize(courtyard, {
  engine: engine.offline().differentiable({ method: 'prb' }),   // path replay backpropagation
  params: [P.sunElev, P.sunAz, P.turbidity, P.wall],
  loss: img => loss.mse(img.log1p(), photo.log1p()),            // log space: HDR highlights must not dominate
  optimizer: { kind: 'adam', lr: 0.02 },
  steps: 400,
  spp: 8,
  decorrelate: true,                                            // independent samples for primal and adjoint
  onStep: ({ step, value }) => ui.plot('#loss', step, value),   // stage ③
});

P.load(fit.params);
```

The stages show up here as well:

```text
ⓘ I471  P.sunElev → illuminance passes through a host map (directNormalLux); its derivative is taken
        by central finite differences (2 extra host evaluations per step). Everything traced is exact AD.
⚠ W470  '#statue.position' changes visibility (shadow edges move). Gradients of discontinuous
        integrands are biased without edge handling. → differentiable({ visibility: 'reparam' })
```

- **Smooth parameters** (albedo, roughness, light power, sun direction in open sky) differentiate cleanly.
- **Visibility-changing parameters** (geometry, occluder positions) need reparameterisation or edge sampling.
- **Without a differentiable backend**, `optimize({ gradient: 'spsa' })` falls back to simultaneous-perturbation estimates.

---

### L18 — Capstone: a product configurator

Everything together: params and sliders, the scattering algebra, local and global fragments, build-time structure, traced appearance, host behaviours, two engines, live mode, an agent with a narrow physical toolset, and physical tests in CI.

```js
// configurator.js
import candela, {
  scene, shape, material, bsdf, ior, light, camera, engine, integrator,
  param, params, ui, units as u,
} from 'candela';
import { weathering, plausibleAlbedo, bokeh } from 'candela/fragments';
import { test } from 'candela/test';
import { carPaint } from './materials/car-paint.js';      // L6
import { standardDeferred } from './engines/deferred.js';  // L12's graph, packaged as a function
import { studioRig, streetRig } from './rigs.js';
import { runAgent, llm } from './agent.js';               // L16

candela.use(plausibleAlbedo);                              // project-wide physical guard rails

// 1 ─ knobs ─────────────────────────────────────────────────────────────────
const P = params({
  paint:  param.color('#7a0c12').role('reflectance').label('Paint'),
  flakes: param.float(0.25).range(0, 0.6).label('Metallic flakes'),
  finish: param.choice(['gloss', 'satin', 'matte']).static(),
  age:    param.float(0).range(0, 30).unit('years'),
  rig:    param.choice(['studio', 'golden-hour', 'night-street']).static(),
  ev:     param.ev(12).range(4, 16),
  fstop:  param.float(4).range(1.4, 22).scale('log'),
});

// 2 ─ appearance: algebra, traced ──────────────────────────────────────────
const body = material(carPaint(P.paint, {
  flakes: P.flakes,
  coatRoughness: P.finish.pick({ gloss: 0.02, satin: 0.15, matte: 0.45 }),   // static → specialised kernel
}));

const tyres = material.pbr().baseColor(0.04).roughness(0.8)
  .with(weathering).aged(P.age);                 // the fragment's method accepts a param (lift + host map)

// 3 ─ structure: build-time JS ─────────────────────────────────────────────
const car = shape.mesh('models/coupe.glb').id('car')
  .part('body',   m => m.material(body))
  .part('chrome', m => m.material(material(bsdf.conductor({ ior: ior.metal('Cr'), roughness: 0.05 }))))
  .part('glass',  m => m.material(material(bsdf.thinDielectric({ ior: 1.52 }))))
  .part('tyres',  m => m.material(tyres));

const turntable = shape.cylinder(3, 0.05).id('turntable')
  .material(material.pbr().baseColor(0.05).roughness(0.3))
  .behavior((self, { dt, state }) => { if (state.spin) self.rotation.y += dt * 0.2; })   // stage ③
  .child(car);

const rigs = {
  'studio':       () => studioRig({ key: u.lm(2400), fill: u.lm(800), rim: u.lm(1600) }),
  'golden-hour':  () => light.daylight({ elevation: u.deg(6), turbidity: 4 }),
  'night-street': () => streetRig(),
};

const s = scene().params(P)
  .add(turntable)
  .add(P.rig.build(name => rigs[name]()))       // a static param drives a build lambda, re-run on change
  .camera(camera.thinLens().with(bokeh).blades(9)
    .focal(u.mm(85)).fstop(P.fstop).focusOn('#car').exposure(P.ev));

// 4 ─ engines: fast while interacting, converged when idle ─────────────────
const realtime  = engine.realtime().graph(standardDeferred({ ssr: true, fog: false }));
const reference = engine.offline().integrator(integrator.path({ maxDepth: 16 })).spectral({ mode: 'hero' });
const app = engine.adaptive({ interactive: realtime, idle: reference, idleAfter: 600 });

const world = await app.run(s, { canvas: '#view', state: { spin: true } });
ui.panel(P).mount('#controls');
P.bindURL();

// 5 ─ assistant: an agent with a narrow, physical toolset ──────────────────
const assistant = world.agent({
  allow: ['params.ev', 'params.fstop', 'params.rig', 'light.*', 'camera.*'],
  deny: ['#car.*'],                                // it may light the car, never repaint it
  budget: { actions: 40, renderMs: 15_000 },
});
ui.chat('#assistant').onMessage(text => runAgent(assistant, text, llm));

// 6 ─ guard rails in CI ────────────────────────────────────────────────────
export const tests = [
  () => test.furnace(body.surface(), { expect: 'no-gain' }),
  () => test.reciprocity(body.surface()),
  () => test.render(s, { engine: reference, golden: 'golden/coupe.exr', metric: 'flip', max: 0.05 }),
  () => engine.compare(s, { reference, candidate: realtime, metric: 'flip', max: 0.12 }),
];
```

**Design decisions visible in the capstone**

- `weathering` goes on the tyres, which are a `material.pbr`. It declares `.requires('baseColor', 'roughness', 'metallic')`, and the car body is built directly from the BSDF algebra and exposes none of those, so `.with(weathering)` there raises **E130**. The fragment contract is checked, not assumed.
- Writing `.aged(Math.min(1, P.age / 25))` would raise **E203** (a param used in build-time JS arithmetic). The fragment's `aged()` lifts its argument and maps on the host instead.
- `P.finish.pick(…)` and `P.rig.build(…)` are the two ways a *static* param affects the result: by selecting values (specialisation) or by regenerating structure (a build-lambda re-run followed by an IR diff).

```diagram
<svg id="my-svg" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="flowchart" style="max-width: 732.414px; background-color: transparent;" viewBox="0 0 732.4140625 818.5" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#my-svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;fill:#000000;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#my-svg .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#my-svg .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#my-svg .error-icon{fill:#552222;}#my-svg .error-text{fill:#552222;stroke:#552222;}#my-svg .edge-thickness-normal{stroke-width:1px;}#my-svg .edge-thickness-thick{stroke-width:3.5px;}#my-svg .edge-pattern-solid{stroke-dasharray:0;}#my-svg .edge-thickness-invisible{stroke-width:0;fill:none;}#my-svg .edge-pattern-dashed{stroke-dasharray:3;}#my-svg .edge-pattern-dotted{stroke-dasharray:2;}#my-svg .marker{fill:#737373;stroke:#737373;}#my-svg .marker.cross{stroke:#737373;}#my-svg svg{font-family:Arial,Helvetica,sans-serif;font-size:13px;}#my-svg p{margin:0;}#my-svg .label{font-family:Arial,Helvetica,sans-serif;color:#000000;}#my-svg .cluster-label text{fill:#333;}#my-svg .cluster-label span{color:#333;}#my-svg .cluster-label span p{background-color:transparent;}#my-svg .label text,#my-svg span{fill:#000000;color:#000000;}#my-svg .node rect,#my-svg .node circle,#my-svg .node ellipse,#my-svg .node polygon,#my-svg .node path{fill:#eee;stroke:#999;stroke-width:1px;}#my-svg .rough-node .label text,#my-svg .node .label text,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-anchor:middle;}#my-svg .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#my-svg .rough-node .label,#my-svg .node .label,#my-svg .image-shape .label,#my-svg .icon-shape .label{text-align:center;}#my-svg .node.clickable{cursor:pointer;}#my-svg .root .anchor path{fill:#737373!important;stroke-width:0;stroke:#737373;}#my-svg .arrowheadPath{fill:#333333;}#my-svg .edgePath .path{stroke:#737373;stroke-width:1px;}#my-svg .flowchart-link{stroke:#737373;fill:none;}#my-svg .edgeLabel{background-color:white;text-align:center;}#my-svg .edgeLabel p{background-color:white;}#my-svg .edgeLabel rect{opacity:0.5;background-color:white;fill:white;}#my-svg .labelBkg{background-color:rgba(255, 255, 255, 0.5);}#my-svg .cluster rect{fill:hsl(0, 0%, 98.9215686275%);stroke:#707070;stroke-width:1px;}#my-svg .cluster text{fill:#333;}#my-svg .cluster span{color:#333;}#my-svg div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:hsl(-160, 0%, 93.3333333333%);border:1px solid #707070;border-radius:2px;pointer-events:none;z-index:100;}#my-svg .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#000000;}#my-svg rect.text{fill:none;stroke-width:0;}#my-svg .icon-shape,#my-svg .image-shape{background-color:white;text-align:center;}#my-svg .icon-shape p,#my-svg .image-shape p{background-color:white;padding:2px;}#my-svg .icon-shape .label rect,#my-svg .image-shape .label rect{opacity:0.5;background-color:white;fill:white;}#my-svg .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#my-svg .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#my-svg .node .neo-node{stroke:#999;}#my-svg [data-look="neo"].node rect,#my-svg [data-look="neo"].cluster rect,#my-svg [data-look="neo"].node polygon{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].swimlane.cluster rect{filter:none;}#my-svg [data-look="neo"].node path{stroke:url(#my-svg-gradient);stroke-width:1px;}#my-svg [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node .neo-line path{stroke:#999;filter:none;}#my-svg [data-look="neo"].node circle{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].node circle .state-start{fill:#000000;}#my-svg [data-look="neo"].icon-shape .icon{fill:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg [data-look="neo"].icon-shape .icon-neo path{stroke:url(#my-svg-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#my-svg :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="my-svg_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointEnd-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-pointStart-margin" class="marker flowchart-v2" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleEnd-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-circleStart-margin" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 0; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"/></marker><marker id="my-svg_flowchart-v2-crossEnd-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5;"/></marker><marker id="my-svg_flowchart-v2-crossStart-margin" class="marker cross flowchart-v2" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" class="arrowMarkerPath" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"/></marker><g class="root"><g class="clusters"/><g class="edgePaths"><path d="M138,96.5L138,100.667C138,104.833,138,113.167,150.932,122.863C163.863,132.559,189.726,143.618,202.658,149.148L215.589,154.677" id="my-svg-L_P_S_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_P_S_0" data-points="W3sieCI6MTM4LCJ5Ijo5Ni41fSx7IngiOjEzOCwieSI6MTIxLjV9LHsieCI6MjE5LjI2NzM2NDc1ODQwMzM1LCJ5IjoxNTYuMjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M416.297,96.5L416.297,100.667C416.297,104.833,416.297,113.167,403.365,122.863C390.434,132.559,364.571,143.618,351.639,149.148L338.707,154.677" id="my-svg-L_F_S_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_F_S_0" data-points="W3sieCI6NDE2LjI5Njg3NSwieSI6OTYuNX0seyJ4Ijo0MTYuMjk2ODc1LCJ5IjoxMjEuNX0seyJ4IjozMzUuMDI5NTEwMjQxNTk2NjUsInkiOjE1Ni4yNX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M277.148,205.75L277.148,211.542C277.148,217.333,277.148,228.917,287.897,239.143C298.645,249.369,320.142,258.238,330.89,262.672L341.638,267.106" id="my-svg-L_S_IR_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_S_IR_0" data-points="W3sieCI6Mjc3LjE0ODQzNzUsInkiOjIwNS43NX0seyJ4IjoyNzcuMTQ4NDM3NSwieSI6MjQwLjV9LHsieCI6MzQ1LjMzNTkzNzUsInkiOjI2OC42MzIwMzc1NzY5MzU1NX1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M345.336,313.029L334.995,317.524C324.655,322.019,303.974,331.01,293.633,339.005C283.293,347,283.293,354,283.293,357.5L283.293,361" id="my-svg-L_IR_RT_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_IR_RT_0" data-points="W3sieCI6MzQ1LjMzNTkzNzUsInkiOjMxMy4wMjg2NjMzNDQzNjk3fSx7IngiOjI4My4yOTI5Njg3NSwieSI6MzQwfSx7IngiOjI4My4yOTI5Njg3NSwieSI6MzY1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M450.133,313.029L460.473,317.524C470.814,322.019,491.495,331.01,501.835,339.005C512.176,347,512.176,354,512.176,357.5L512.176,361" id="my-svg-L_IR_REF_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_IR_REF_0" data-points="W3sieCI6NDUwLjEzMjgxMjUsInkiOjMxMy4wMjg2NjMzNDQzNjk3fSx7IngiOjUxMi4xNzU3ODEyNSwieSI6MzQwfSx7IngiOjUxMi4xNzU3ODEyNSwieSI6MzY1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M283.293,434L283.293,438.167C283.293,442.333,283.293,450.667,290.716,458.692C298.138,466.718,312.983,474.437,320.406,478.296L327.829,482.155" id="my-svg-L_RT_AD_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_RT_AD_0" data-points="W3sieCI6MjgzLjI5Mjk2ODc1LCJ5Ijo0MzR9LHsieCI6MjgzLjI5Mjk2ODc1LCJ5Ijo0NTl9LHsieCI6MzMxLjM3NzU5MzIyNDc4OTksInkiOjQ4NH1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M512.176,434L512.176,438.167C512.176,442.333,512.176,450.667,504.753,458.692C497.331,466.718,482.485,474.437,475.063,478.296L467.64,482.155" id="my-svg-L_REF_AD_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_REF_AD_0" data-points="W3sieCI6NTEyLjE3NTc4MTI1LCJ5Ijo0MzR9LHsieCI6NTEyLjE3NTc4MTI1LCJ5Ijo0NTl9LHsieCI6NDY0LjA5MTE1Njc3NTIxMDEsInkiOjQ4NH1d" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M397.734,553L397.734,558.792C397.734,564.583,397.734,576.167,408.281,587.478C418.828,598.79,439.921,609.83,450.468,615.35L461.015,620.87" id="my-svg-L_AD_W_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_AD_W_0" data-points="W3sieCI6Mzk3LjczNDM3NSwieSI6NTUzfSx7IngiOjM5Ny43MzQzNzUsInkiOjU4Ny43NX0seyJ4Ijo0NjQuNTU4NTkzNzUsInkiOjYyMi43MjQ2MjQ2MDkxNDY5fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M625.102,543.25L625.102,550.667C625.102,558.083,625.102,572.917,614.555,585.853C604.008,598.79,582.915,609.83,572.368,615.35L561.821,620.87" id="my-svg-L_UI_W_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_UI_W_0" data-points="W3sieCI6NjI1LjEwMTU2MjUsInkiOjU0My4yNX0seyJ4Ijo2MjUuMTAxNTYyNSwieSI6NTg3Ljc1fSx7IngiOjU1OC4yNzczNDM3NSwieSI6NjIyLjcyNDYyNDYwOTE0Njl9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M544.978,741.5L550.612,735.708C556.246,729.917,567.514,718.333,567.09,707.191C566.666,696.049,554.552,685.349,548.494,679.998L542.437,674.648" id="my-svg-L_AG_W_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_AG_W_0" data-points="W3sieCI6NTQ0Ljk3ODAxNTAwNDUxMjYsInkiOjc0MS41fSx7IngiOjU3OC43ODEyNSwieSI6NzA2Ljc1fSx7IngiOjUzOS40Mzg4Mjk0MzgwMjUyLCJ5Ijo2NzJ9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M483.397,672L476.84,677.792C470.283,683.583,457.169,695.167,455.781,706.272C454.393,717.378,464.731,728.005,469.9,733.319L475.069,738.633" id="my-svg-L_W_AG_0" class="edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_W_AG_0" data-points="W3sieCI6NDgzLjM5NzEwODA2MTk3NDgsInkiOjY3Mn0seyJ4Ijo0NDQuMDU0Njg3NSwieSI6NzA2Ljc1fSx7IngiOjQ3Ny44NTc5MjI0OTU0ODczNCwieSI6NzQxLjV9XQ==" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/><path d="M518.32,215.5L518.32,219.667C518.32,223.833,518.32,232.167,507.572,240.768C496.824,249.369,475.327,258.238,464.579,262.672L453.83,267.106" id="my-svg-L_CI_IR_0" class="edge-thickness-normal edge-pattern-dotted edge-thickness-normal edge-pattern-solid flowchart-link" style=";" data-edge="true" data-et="edge" data-id="L_CI_IR_0" data-points="W3sieCI6NTE4LjMyMDMxMjUsInkiOjIxNS41fSx7IngiOjUxOC4zMjAzMTI1LCJ5IjoyNDAuNX0seyJ4Ijo0NTAuMTMyODEyNSwieSI6MjY4LjYzMjAzNzU3NjkzNTU1fV0=" data-look="classic" marker-end="url(#my-svg_flowchart-v2-pointEnd)"/></g><g class="edgeLabels"><g class="edgeLabel"><g class="label" data-id="L_P_S_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_F_S_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_S_IR_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_IR_RT_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_IR_REF_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_RT_AD_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_REF_AD_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_AD_W_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(625.1015625, 587.75)"><g class="label" data-id="L_UI_W_0" transform="translate(-43, -9.75)"><foreignObject width="86" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>param patches</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(578.78125, 706.75)"><g class="label" data-id="L_AG_W_0" transform="translate(-50.59375, -9.75)"><foreignObject width="101.1875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>validated patches</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(445.55845, 705.42177)"><g class="label" data-id="L_W_AG_0" transform="translate(-64.1328125, -9.75)"><foreignObject width="128.265625" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"><p>observations + meters</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" data-id="L_CI_IR_0" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel"></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default" id="my-svg-flowchart-P-0" data-look="classic" transform="translate(138, 52.25)"><rect class="basic label-container" style="" x="-130" y="-44.25" width="260" height="88.5"/><g class="label" style="" transform="translate(-100, -29.25)"><rect/><foreignObject width="200" height="58.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table; white-space: break-spaces; line-height: 1.5; max-width: 200px; text-align: center; width: 200px;"><span class="nodeLabel"><p>params<br />paint, flakes, finish, age, rig, ev, fstop</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-S-1" data-look="classic" transform="translate(277.1484375, 181)"><rect class="basic label-container" style="" x="-71.9140625" y="-24.75" width="143.828125" height="49.5"/><g class="label" style="" transform="translate(-41.9140625, -9.75)"><rect/><foreignObject width="83.828125" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>scene builders</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-F-2" data-look="classic" transform="translate(416.296875, 52.25)"><rect class="basic label-container" style="" x="-98.296875" y="-44.25" width="196.59375" height="88.5"/><g class="label" style="" transform="translate(-68.296875, -29.25)"><rect/><foreignObject width="136.59375" height="58.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>fragments<br />plausibleAlbedo global<br />weathering, bokeh local</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-IR-5" data-look="classic" transform="translate(397.734375, 290.25)"><rect class="basic label-container" style="" x="-52.3984375" y="-24.75" width="104.796875" height="49.5"/><g class="label" style="" transform="translate(-22.3984375, -9.75)"><rect/><foreignObject width="44.796875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>IR DAG</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-RT-7" data-look="classic" transform="translate(283.29296875, 399.5)"><rect class="basic label-container" style="" x="-93.2421875" y="-34.5" width="186.484375" height="69"/><g class="label" style="" transform="translate(-63.2421875, -19.5)"><rect/><foreignObject width="126.484375" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>realtime engine<br />deferred render graph</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-REF-9" data-look="classic" transform="translate(512.17578125, 399.5)"><rect class="basic label-container" style="" x="-85.640625" y="-34.5" width="171.28125" height="69"/><g class="label" style="" transform="translate(-55.640625, -19.5)"><rect/><foreignObject width="111.28125" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>reference engine<br />spectral path tracer</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-AD-11" data-look="classic" transform="translate(397.734375, 518.5)"><rect class="basic label-container" style="" x="-78.0546875" y="-34.5" width="156.109375" height="69"/><g class="label" style="" transform="translate(-48.0546875, -19.5)"><rect/><foreignObject width="96.109375" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>adaptive switch<br />idle after 600 ms</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-W-15" data-look="classic" transform="translate(511.41796875, 647.25)"><rect class="basic label-container" style="" x="-46.859375" y="-24.75" width="93.71875" height="49.5"/><g class="label" style="" transform="translate(-16.859375, -9.75)"><rect/><foreignObject width="33.71875" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>World</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-UI-16" data-look="classic" transform="translate(625.1015625, 518.5)"><rect class="basic label-container" style="" x="-99.3125" y="-24.75" width="198.625" height="49.5"/><g class="label" style="" transform="translate(-69.3125, -9.75)"><rect/><foreignObject width="138.625" height="19.5"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>slider panel + URL state</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-AG-18" data-look="classic" transform="translate(511.41796875, 776)"><rect class="basic label-container" style="" x="-82.2109375" y="-34.5" width="164.421875" height="69"/><g class="label" style="" transform="translate(-52.2109375, -19.5)"><rect/><foreignObject width="104.421875" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>assistant agent<br />allow-list + budget</p></span></div></foreignObject></g></g><g class="node default" id="my-svg-flowchart-CI-22" data-look="classic" transform="translate(518.3203125, 181)"><rect class="basic label-container" style="" x="-119.2578125" y="-34.5" width="238.515625" height="69"/><g class="label" style="" transform="translate(-89.2578125, -19.5)"><rect/><foreignObject width="178.515625" height="39"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel"><p>CI: furnace, reciprocity,<br />golden image, engine compare</p></span></div></foreignObject></g></g></g></g></g><defs><filter id="my-svg-drop-shadow" height="130%" width="130%"><feDropShadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><defs><filter id="my-svg-drop-shadow-small" height="150%" width="150%"><feDropShadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"/></filter></defs><linearGradient id="my-svg-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="hsl(0, 0%, 83.3333333333%)" stop-opacity="1"/><stop offset="100%" stop-color="hsl(0, 0%, 88.9215686275%)" stop-opacity="1"/></linearGradient></svg>
```

---
