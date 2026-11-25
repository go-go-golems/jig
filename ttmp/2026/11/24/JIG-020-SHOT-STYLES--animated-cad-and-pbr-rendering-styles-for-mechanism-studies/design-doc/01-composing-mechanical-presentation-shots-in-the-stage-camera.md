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

## Further shot types

The same frame data can support turntables by changing the camera, split screens and detail insets by rendering more than one camera at the same instant, and motion trails by sampling a named point. These are distinct camera and layout features. This ticket prioritizes the hybrid surface pass, style animation, isolation and fixed sections discussed for the Singer head.
