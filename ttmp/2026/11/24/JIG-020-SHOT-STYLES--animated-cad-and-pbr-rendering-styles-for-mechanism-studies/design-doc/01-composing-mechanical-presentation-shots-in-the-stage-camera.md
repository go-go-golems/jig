---
Title: Composing mechanical presentation shots in the Stage camera
Ticket: JIG-020-SHOT-STYLES
Status: active
Topics:
    - cad
    - rendering
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/content/presets/SG-09-exploded-head/script.js
      Note: Example study and shot
    - Path: repo://import/jigcad/src/stage/sheet.js
      Note: CAD depth and edge pass
    - Path: repo://import/jigcad/src/ui/views/stage-render.jsx
      Note: Preview and export lifecycle
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T20:07:40.992720335-05:00
WhatFor: ""
WhenToUse: ""
---

# Composing mechanical presentation shots in the Stage camera

## A shot has two clocks

A mechanism study expresses physical motion. The Singer upper shaft turns through 720 degrees and its drive callback computes the other joint coordinates. Its definition lives in import/jigcad/content/presets/SG-09-exploded-head/script.js. The component dimensions and kinematic functions come from the shared Singer part files. Editing the duration of a visual transition should never change the travel of the needle.

Presentation uses elapsed seconds. SG-09 prepends three seconds of separation, a one-second hold and three seconds of reassembly before six seconds of sewing. Its direction vectors and label-fade setting live in meta.json. study-samples.js converts an introductory sample into a spread fraction. study-playback.jsx applies those translations to solved occurrence transforms. Independently, the photorealistic Render tab accepts a look.js file with materials, lighting and an optional exported animation from asm.animate(). The Stage export already evaluates its own timeline for the camera preview and output file.

## Frame evaluation

Attach an optional shot to the study in ordinary preset JavaScript. Sparse numeric keys specify surface mix, line opacity and annotation opacity in presentation seconds. The author can construct these values using loops, shared constants or imported part files inside the existing compile worker. Only serializable values cross the boundary into the interface. Visibility and section choices change at a key. Expose the evaluated result as a preset animation choice alongside three fixed looks.

For example, a six-second shot could start with the finished surfaces visible, introduce visible edges over the first second, and change to a technical drawing over the next two seconds. Moving a key from second one to second two changes only the editorial timing. Capped section cuts are specified in component coordinates, which makes a cut follow the moving part. Isolation selects occurrences by their stable assembly IDs.

```text
preset script -> compiled study and serializable shot
                        |
time -> sample -> occurrence poses + style values
                        |
          display geometry and orthographic camera
               /                        \
       Candela beauty                 CAD depth and lines
               \                        /
                  blend -> annotations
                           |
                    preview / PNG / movie
```

## Registration and surface composition

Both passes require the same orthographic basis, target, pixels per millimetre, image dimensions and posed geometry. Candela's ordinary named front and axonometric views use perspective. Matching their names leaves depth-dependent errors. Hand the resolved Stage camera to the beauty renderer and transform its axes into Candela coordinates. During an explosion, pass the displayed occurrence matrices, including the additional world translations. A fixed camera envelope across all samples prevents changes of scale during animation.

Composite the beauty image over the drafting surface with the authored surface opacity. After that operation, draw the classified CAD edges in screen space at their existing weights and independently controlled opacity. Draw annotations last. For a pure beauty export the edge and annotation opacity should both be zero. A failed backend must produce a visible error and prevent a stale preview from being downloaded.

## Section geometry

Treat a section as display geometry. Clip selected solids, reconstruct interior cut faces and carry the same clipped triangles into outlining and shading. A bore through a cut wall must remain a hole in the cap. A cut should leave the CAD source, printable geometry and mechanism constraints intact. Isolation changes which occurrences render and participate in visibility. The mechanical solver continues to operate on the full assembly.

## Implementation and review

1. Establish an editable shot contract and test interpolation, holds, invalid values and the Singer loop seam.
2. Evaluate one camera and display pose for each output sample. Expose individual surface, edge and annotation controls through the Stage render dialog.
3. Obtain a beauty image from the existing Candela scene and stage it before the CAD edges. Keep interactive redraw jobs cancellable and serialize GPU work. Preview, still and video must share the drawing path.
4. Implement occurrence-local capped sections and isolation. Validate caps with holes and verify registration at small features in the Singer assembly.
5. Capture workbench images and run an end-to-end export. Compare a reference CAD frame with default settings and exercise animation keys during scrubbing.

## Authoring and running a shot

Open SG-09, switch to Code and find the study named Stitch cycle. Press Run after editing. In Stage, open Render, choose Preset animation under Style and scrub Study frame. CAD lines, PBR and PBR + CAD edges also work as manual still or movie styles. The combined style exposes surface blend and edge opacity directly. An authored shot can be modified without editing a rendering engine.

The following legal keys illustrate the API. Insert the array as the shot property on the study alongside phase, steps and at. Time is elapsed presentation time in seconds, including the explode and reassembly introduction. A plain motion study uses its own playback duration. The compiler validates the channel names and occurrence IDs, and prefixes occurrence references when a child study is lifted into an assembly.

```js
shot: [
  { time: 0, surface: 1, edges: 0, annotations: 0 },
  { time: 3, surface: 0, edges: 1, annotations: 1 },
  { time: 4, surface: 0, edges: 1, annotations: 1 },
  { time: 7, surface: 1, edges: 0.45, annotations: 0 },
  { time: 8, isolate: ['presserGuide', 'presserBar'],
    section: { components: ['presserGuide'], normal: [0,-1,0], offset: 0 } },
  { time: 10, isolate: null, section: null, view: { inset: 'presserFoot' } },
  { time: 13, view: 'stage', edges: 0 }
]
```

| Channel | Meaning |
| --- | --- |
| surface | PBR fraction from 0 to 1 over the CAD paper pass. |
| edges | Opacity of the Stage edge strokes, including silhouettes. |
| annotations | Opacity of the annotation layer including sheet furniture, enabled labels and motion trails. Stage visibility switches and the presentation's label fade still apply. |
| isolate | Exact occurrence IDs to keep, or null to restore the assembly. |
| section | One half-space applied to the named components. Each component keeps local points satisfying dot(unit normal, point) ≤ offset, in mm. Use null to clear. |
| accent | Components, a six-digit hex color and opacity for a visibility-tested color overlay. |
| trail | Component, local XYZ point in mm, history length in seconds and a six-digit hex color. Gaps in the study break the trail. |
| view | stage, turntable, front-side or an object with an inset occurrence ID. |

Numeric opacity channels interpolate linearly between their own keys and hold after their last key. Selections and camera compositions take effect at the keyed time. A turntable makes one revolution over the complete study. Front and side panels sample the same mechanical state. A detail inset fits its camera to the chosen moving occurrence. The Composition control can override the authored camera arrangement for an individual export.

SG-09 uses a closed 13-second shot. The first three seconds transition to drafting as the parts separate. The separated view holds through second four. Reassembly restores the shaded surfaces by second seven. At second eight the presser guide is sectioned and surrounding parts disappear. At second ten the complete head returns, with a teal drive train and an orange needle trajectory. The final surface and visibility settings match the starting shot. The fixed section and explosion paths are presentation geometry.

## Source map

| File | Responsibility |
| --- | --- |
| import/jigcad/content/presets/SG-09-exploded-head/script.js | Real editable study and shot example. |
| import/jigcad/src/render/shot.js | Schema, component remapping and evaluator. |
| import/jigcad/src/ui/views/study-playback.jsx | Maps a timeline row to the solved and exploded occurrence transforms. |
| import/jigcad/src/stage/output-camera.js | Captures the view, fits the complete study, evaluates the frame and draws the selected cameras. |
| import/jigcad/src/render/stage-pbr.js | Builds the look from the CAD package and obtains the Candela color image. |
| import/jigcad/src/stage/section.js and shot-marks.js | Clips solids, generates caps, tints visible face pixels, and traces component-local points. |
| import/jigcad/src/stage/sheet.js | Composes paper, beauty, edges and annotations. |
| import/jigcad/src/ui/views/stage-render.jsx | Owns the asynchronous preview, PNG and movie controls, cancellation and GPU resource lifetime. |

## Verification and limits

The two-depth registration check projects separate objects through the Stage and Candela camera models. The section audit sweeps four planes across the 29 Singer bodies and separately measures the retained volume and cap area on a bored sleeve. The browser acceptance test changes styles, scrubs the shot, checks PNG equality against the camera preview, exports the actual study and decodes its 312 H.264 frames. The verification scripts and captured images are stored under scripts and sources in this ticket.

The PBR pass uses a GPU backend. This run exercised WebGL2 and a deliberate backend failure. The regular CAD renderer remains available on a machine without GPU rendering. The section offset is fixed within a keyed interval. The current interface supports a single plane per selected component group.
