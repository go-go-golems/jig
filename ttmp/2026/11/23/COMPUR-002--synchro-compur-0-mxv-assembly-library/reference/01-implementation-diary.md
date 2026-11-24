---
Title: Implementation diary
Ticket: COMPUR-002
Status: active
Topics:
    - cad
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T19:39:24.788523025-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1. Trace the inherited model and split its construction from its placement

The repository already contained a model and a baked exposure. I traced its part definitions to the supplied CAD archive before changing the entry script. The decomposition retains the coordinate convention that the animation requires.

### Prompt Context

**User prompt (verbatim)**

> Look at @~/Downloads/ -rw------- 1 manuel manuel   9020467 Nov 23 12:57 'synchro-compur-0-mxv(3).zip'
> -rw------- 1 manuel manuel 223926680 Nov 23 19:36  synchro-compur-sources.zip
>
> And then at the local jig and the cad models, and then properly model it all , use the repair manuals and cross verify the pieces. In fact, work in smaller assemblies and write a whole compur set of presets. Also, I wonder if we can "import" pieces from preset / file to another so that we can ave a collection of modeled parts and can then assemble them in other presets.
>
> Create a docmgr ticket, then Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
>
> THen get to work rightaway and we can start modularizing later if it's not possible yet.
>
> commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)
>
> Once you have a good workflow going, write a playbook so we can repeat it more. You can use subagents, but check how things go.

**Assistant interpretation.** Build an inspectable family of service assemblies and document how an intern can check them against the originals.

**Inferred user intent.** Make the work cumulative so that correcting one blade or bearing improves multiple views.

**Commit (code).** b0eae31, Load project-local part factories and assemble M-11 from the shared library.

### What I did

- Created COMPUR-002 and assigned three assembly investigations, with separate ownership for the moving sectors.
- Listed both ZIP central directories, inspected the upstream source ledger and chapter 23, and compared cad/scripts against M-11.
- Read build.mjs and worker.js. Moved the 29 builder expressions and their ports into compur.parts.js. Added project-local evaluation to compileFiles.
- Ran node --test import/jigcad/test/render/compur.test.mjs. The command passed in 26.6 seconds.

### Why

The assembly names also key the Candela pose table. Keeping the names, axes and reference angles stable preserves the exposure when the same builders are reused.

### What worked

The original render regression accepted the extracted model and the supplied pose data. The shelf collector already reads all sibling files into each project.

### What didn't work

The initial git add returned “Unable to create …/.git/index.lock: Read-only file system”. Retried the staging and commit operations with the required Git metadata permission.

### What I learned

The archive explicitly identifies unresolved axial clashes and calibrated parameters. The manual's bracket convention assigns the larger diameter to CN-1210-000.

### What was tricky to build

Reusing a prebuilt part across calls can share mutable builder state. Returning factories lets the assembly choose which solids to construct. A port remains attached to the same geometry each time.

### What warrants a second pair of eyes

The archive's layer thicknesses and spring law. Preserving a transform establishes alignment with the simulated body, while physical fit requires independent measurements.

### What should be done in the future

Add measurements at the post, slots and working faces before releasing manufacturing drawings.

### Code review instructions

Read the M-11 entry script and then one factory, including its trailing ports. Follow compileFiles into runScript and the real render regression.

### Technical details

Each compile carries its own file map and logger. Nested imports share that compile's data and maintain a branch-local ancestry list, so circular dependencies fail explicitly.

## Step 2. Make a published part usable in another open design

Repository presets can share a relative link while a browser project needs an editable copy. I added a file picker to the existing Files menu and exercised the copy on a running, disposable A-01 project.

### Prompt Context

See Step 1. The request to import a piece applies both to the repository author and to a person building a new assembly in the workbench.

**Commit (code).** 39f3fb6, Copy published part files in the workbench and locate import errors.

### What I did

- Used host.presets, host.presetFiles and host.addFile to copy a published .parts.js sibling into the currently open project. A name collision disables the option.
- Added nested-import, missing-file and cycle tests. The diagnostic carries the library filename as well as its line.
- Opened the test server on loopback, picked the M-11 library in A-01 and saw the selected edited library tab. Removed the temporary copy and stopped the server using lsof-who.

### Why

Projects already persist a file map. A copied library continues to work when the source project is closed or its author changes the published geometry.

### What worked

The browser selected the imported compur.parts.js tab. The two direct worker regression tests passed with Node 24 and test isolation disabled.

### What didn't work

The former diagnostic expression escaped only the first dot in a filename. A name containing square brackets requires escaping every regular-expression metacharacter. Added blade[1].js as the reproducer.

### What I learned

The Code view already had file creation, saving and revert semantics. The publish-time link and the browser copy serve different lifetimes.

### What was tricky to build

A jump to another file had to change tabs before moving the caret. The old callback recursively captured the previous file name. A post-render callback now locates the line directly in the requested file.

### What warrants a second pair of eyes

A copied library can import other files, which the user also needs to copy. The picker shows published contents and prevents overwrites. The Script export still returns only the entry file.

### What should be done in the future

Track dependencies if a later collection requires automatic multi-file transfer.

### Code review instructions

Read CodeView's Files menu and the worker's compileFiles function. Run node --test --test-isolation=none import/jigcad/test/render/part-files.test.mjs and repeat the copy from M-11 into a fresh project.

### Technical details

The picker consumes the host's list of file keys, serializes the preset and filename as a pair and resolves the selected text only when requested. Projects compile with their local copy.

## Step 3. Cross-check the service assemblies under motion

Three parallel investigations compared the service illustrations, the generated archive CAD and the local solids. I checked the proposed part ownership, group IDs, library interface, validation commands and working tree during integration. Several defects only became visible after moving off the home pose.

### Prompt Context

See Step 1. The acceptance criteria were physical identification, inspectable subassemblies and explicit accounting for estimates.

### What I did

- Inspected factory PDF p9 and the archive chapters on source selection, calibration and clashes. The complete source archive hashes are listed below.
- Corrected the shutter end-blade identities and compared their projected coverage against the working aperture.
- Inspected the cocking gear sector, cam lug heights, retarder cartridge mounting and five-leaf diaphragm study. Kept the M/X and V comparison studies separate because the course photographs depict the size-00 sibling.
- Compiled all eight CP presets. Ran the M-11 home clearance query, which classifies touching surfaces and overlaps together. Rebuilt the web bundle. Reviewed the source and compiled entry points.

### Why

A zero-position compile cannot distinguish a disconnected bearing, an incorrectly phased sector or a slot that strikes its pin halfway through travel.

### What worked

- CP-03's three couplings give −0.75°, +8° and −80° for +0.05° of segment motion once the cartridge has a rigid seat.
- The planar cocking gear sweep sampled 761 positions and found 0.017339 mm minimum gap.
- The CP-02 leaf projections covered every one of 31,417 test rays at closure and cleared every test ray at full opening. CP-08 cleared its 21 component pairs at the full-open pose.

### What didn't work

- The first nonzero CP-03 solve reported asm.conflict. The cartridge had an initial placement but lacked a rigid joint to its base.
- The first five-leaf diaphragm study showed contacts at all five guide slots. Centering the slots around the actual guide-pin placement removed them in the open pose.
- The integrated render test reported “AssertionError [ERR_ASSERTION]: 113 materials” at compur.test.mjs:184. The original test-file summary hid the individual cases. Re-running with --test-isolation=none exposed the shader-budget regression.
- The first cloud upload encountered “lookup webapp-prod.cloud.remarkable.engineering: no such host”. The network-authorized retry delivered the design guide and playbook to /ai/2026/11/23/COMPUR-002.

### What I learned

The first speed wheel and kicker occupy the same layer. Shifting the wheel upward to clear the kicker also breaks axial mesh with the second pinion. Accurate arbor heights would constrain that redesign.

### What was tricky to build

The five-blade pack has a circular pattern but three service numbers. Changes to the tip outline affect light sealing; changing pin/slot geometry affects movement. Those require different measurements and tests.

### What warrants a second pair of eyes

The blade end tips are planar, the V unit omits the intermediate gearing, and CP-06 has no registered size-0 mounting pose. Some paired surfaces in the assembly are intended seats. Read each flagged pair as a question for mechanical inspection.

### What should be done in the future

Measure a second size-0 landmark for each local cartridge, the first-wheel arbor heights and the spring sections. Check intermediate and returning stroke poses against independent observations.

### Code review instructions

Open the Notes beside each CP script. Run the aperture and cocking checks under this ticket's scripts directory. Run the M-11 render test with individual case reporting and review both the results and the remaining open fits.

### Technical details

- Reconstruction ZIP SHA-256: 3e7ec0fad14ef01b932cb8b0cde4feb69b4def8aa845bab3d5fef7747c01485d
- Sources ZIP SHA-256: 9497ea35c9f831517f050d931fca7b868e79af91bc49b6d27ce95fb3a0735907
- Blade coverage uses a 0.125 mm sample lattice over a 25 mm design pupil. The factory clear opening is 24 mm.

## Step 4. Recheck the assembled frame after correcting the lens seats

A closer reading of the upper axial section on factory PDF page 9 supplied enough evidence to correct the continuous optical tube. We separated the seats, recomputed the blade clearances, measured the render budget and ran the full assembly again.

### Prompt Context

See Step 1. A cross-check should change the model when a primary drawing resolves the uncertainty.

**Commit (code).** afd1ed3, Model eight Compur service assemblies and correct shutter geometry from service plates.

### What I did

- Attached the modeled rear threaded projection to the housing and relieved the lower part of the separate front seat. The external dimensions remain tied to the November 1956 specification.
- Checked the new seat against moving leaves, iris and pallet carrier. Queried all M-11 pairs at the modeled reference pose. Added a component cross-reference to the intern guide.
- Kept the rounded slot wall grain direction consistent with the adjacent straight wall. The updated scene measured 89 materials and 134,755 bytes of shader.
- Rebuilt the workbench, checked all eight presets, exercised the browser file picker, and ran the renderer, file resolver and UI regressions.

### Why

The section gives independent evidence for the two seats. The exact depth of the internal relief remains an engineering choice and is called out in CP-01.

### What worked

The assembled query dropped from 42 touching-or-overlapping pairs in the earlier snapshot to 30 after the remaining seat and blade changes. The final query recorded 134 exact, 77 mesh and 223 box-excluded body pairs. All nine render cases and twelve worker/UI cases passed. The blade pack cleared the seven additional sampled stroke settings, including 7.7° overtravel.

### What didn't work

The initial CAD review suggested that a specimen was needed to decide whether the optical tube was continuous. Enlarging the section resolved that specific question. The first timing wheel and its kicker still overlap. The available views do not settle their axial order.

### What I learned

Removing a false through-wall affects several contact pairs at once. Clearance counts alone cannot say whether the remaining contacts are desirable. An external thread seated against its flange and a pin crossing a wheel require different interpretations.

### What was tricky to build

Moving topology while keeping stable component IDs allowed the full pose and material tests to continue exercising the same assembly. The split required moving the actual threaded feature between two builders while preserving the external mounting dimensions.

### What warrants a second pair of eyes

The derived front skirt has an inferred seat height of 11.52 mm and a 3.48 mm relieved lower section. The two values deserve a specimen measurement. The published presets preserve the corrected registration and expose uncertain cartridge fits separately.

### What should be done in the future

Capture the two pinion heights bounding the first wheel and the flash/V module seats. Use those measurements for a future clearance pass.

### Code review instructions

Compare the housing and tube factories with the p9 upper section. Rebuild the shelf and run the ticket clearance, aperture and gear scripts. Review the guide's component cross-reference and the remaining specimen task.

### Technical details

The final package adds eight studies under Synchro-Compur. M-11 still uses its original 29 occurrence IDs. The full-open diaphragm and flash/V studies have independent evidence limits.

The blade investigation also found that discarding the return value of an immutable assembly builder could produce an apparently successful empty assembly. Checking the eight expected bodies exposed the error. The first contour trim then left 598 sampled light leaks; widening the opposite edge sealed those but obstructed 315 rays in the open pose. Clipping against the inverse-transformed open pupil produced the final sampled result.

The updated guide and playbook were delivered under a separate title after the lens-seat correction. Cloud receipt: OK: uploaded Compur 0 MXV Verified Assembly Guide and Playbook.pdf -> /ai/2026/11/23/COMPUR-002. The earlier design checkpoint remains in that folder.
