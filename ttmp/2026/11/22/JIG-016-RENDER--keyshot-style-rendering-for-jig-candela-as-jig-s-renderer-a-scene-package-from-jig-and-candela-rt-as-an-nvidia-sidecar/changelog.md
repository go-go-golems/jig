# Changelog

## 2026-11-22

- Initial workspace created

## 2026-11-22

Created the ticket and the intern design guide. The second pass corrected the example syntax against presets A-06 and F-06, renamed the export to CAD package (Candela's scene package is a different format), fixed the frame mapping to 0.001·(x, z, −y), moved jig selectors into jig scripts (D9), and added the sidecar token and localhost binding

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/ttmp/2026/11/22/JIG-016-RENDER--keyshot-style-rendering-for-jig-candela-as-jig-s-renderer-a-scene-package-from-jig-and-candela-rt-as-an-nvidia-sidecar/design-doc/01-rendering-jig-with-candela-intern-guide-design-and-implementation-plan.md — the guide

## 2026-11-22

Implemented phases 0-5 on branch jig-016-render: Candela vendored (65d237d), CAD package + bridge (65d237d), .finish() and one vocabulary (54b4014), candela-rt sidecar (619caaf), study poses (c218987), Render view with picking, material library, timeline and PNG/MP4 jobs (2bc5b73, a1c04de, 89ad6fc). Verified: 36 Node render tests, engine suite 62/62, Go tests, and 10/10 browser checks on the Intel GPU (WebGPU).

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/src/engine/cadpkg.js — the CAD package export
- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/src/render/host.js — the Render view's controller
- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/src/render/jig-candela.js — the bridge (Candela library module)

## 2026-11-22

Merged the remaining items: lockstitch comparison (586368c) with the two inferProcess gaps fixed (1358880); assembly finishes and caching between compiles (15041cb); the Render view follows the mechanism and has motion blur (260d98f); the Compur preset M-11 with poses from its own simulation (46416aa); one material per tool axis line and look files out of the model (6dc5c20). Render tests 74/74, engine 62/62, browser 14/14.

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/content/presets/M-11-synchro-compur/look.js — the Compur look playing baked poses
- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/src/render/jig-candela.js — toolMeta, the definition cache
