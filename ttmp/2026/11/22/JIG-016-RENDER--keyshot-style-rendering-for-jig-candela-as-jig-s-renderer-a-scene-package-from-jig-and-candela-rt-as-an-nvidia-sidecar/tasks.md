# Tasks

## TODO
- [x] Write the intern guide: background, bridge API, CAD package, appearance, Render view, motion, sidecar, merge plan <!-- t:tmms -->
- [x] Upload the guide to reMarkable <!-- t:5yiy -->
- [x] Phase 0: vendor Candela engine into jig; widen Candela id grammar <!-- t:l59e -->
- [x] Phase 1: bridge (jigScene) and CAD package export, headless tests on F-06 and lockstitch <!-- t:fq3c -->
- [x] Phase 2: .finish() and one material vocabulary <!-- t:j34x -->
- [x] Phase 3: Render view (Viewport, picking, material library, look.js) <!-- t:1z2p -->
- [ ] Phase 4: study poses, drag poses, sequences with motion blur <!-- t:fby3 -->
- [x] Phase 5: candela-rt info, sidecar launch and /rt proxy in jigcad serve <!-- t:r3aj -->
- [ ] Phase 6: subtree merge of pbr-spark, CI on the nvidia runner, release artifact <!-- t:ghj2 -->
- [x] Phase 4 (done part): study poses carried in the CAD package, asm.studies/posesAt/animate, Render-view timeline opening at the stage's pose, PNG and MP4/WebM render jobs <!-- t:is4c -->
- [ ] Phase 4 (open): the Mechanism view forwards drags and study scrubs to the Render view; Compur adapter (poses from an outside engine); a motion-blur control <!-- t:f7ro -->
- [ ] Phase 1 (open): lockstitch comparison test: jig's face names and exact axes against convert.py's fitted ones <!-- t:pl5p -->
- [ ] pbr-spark: push branch jig-016-path-ids (38fc068, path ids) and open a PR; needs the repository owner's go-ahead <!-- t:apm1 -->
- [ ] Assembly-level .finish(component, meta) through the subassembly expansion rules (FLEXIBLE table) <!-- t:k8tp -->
- [ ] Cache render meshes and mesh definitions by body content across compiles (large assemblies) <!-- t:q352 -->
- [ ] candela-rt: render a CAD package offline (scene-directory form) and test the sidecar against a real candela-rt on the DGX Spark <!-- t:0nba -->
