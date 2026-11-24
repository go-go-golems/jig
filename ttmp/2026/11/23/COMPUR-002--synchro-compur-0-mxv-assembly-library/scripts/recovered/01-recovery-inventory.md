---
Title: Compur script recovery inventory
Ticket: COMPUR-002
DocType: reference
Status: active
Topics: [cad]
Intent: long-term
Summary: Provenance and replay instructions for the historical Compur scripts and report captures.
---

# Compur script recovery

This directory preserves the local scripts used to build and inspect the Compur presets and illustrate the Obsidian report on November 23, 2026. The working model at the end of that investigation is Jig revision `c4f5aa8`. The report and its nine published figures are in the go-go-parc vault at revision `ceccd72`, under `Projects/2026/11/23/`.

## Replay the report figures

Run these commands from the Jig repository root with Node 24, a built Jig workbench, Poppler, unzip, and Debian Python with Matplotlib and Shapely. Supply a **new** output directory. The generation step keeps the input crops, measured coverage counts and projected triangles with the results.

```sh
ticket=ttmp/2026/11/23/COMPUR-002--synchro-compur-0-mxv-assembly-library
scripts="$ticket/scripts/recovered/report"
make web
sh "$scripts/source-figures.sh" \
  "$HOME/Downloads/synchro-compur-0-mxv(3).zip" \
  "$HOME/Downloads/compur shutter repair manual_text.pdf" \
  /tmp/compur-report-replay
```

The five outputs are the plate-7 blade inset, Lesson 9 timer photograph, axial section, annotated pinion location and three-pose blade plot. Four named members of the model ZIP supply the plate-2 measurement data and source photographs. Poppler renders the upper section from page 9 of the text-layer manual. The blade plot reads pose meshes and measured counts from the same compiler run.

For the four JigCAD screenshots, run a local workbench and use Playwright with its Chromium browser installed. The optional last argument to the capture command is the path to an installed Playwright Node package. By default Node resolves `playwright`. Choose an available loopback port and use that port for all three commands.

```sh
tmux new-session -d -s compur-report-replay \
  'go run ./cmd/jigcad serve --listen 127.0.0.1:18967 --dist import/jigcad/dist --render off'
node "$scripts/capture-workbench.cjs" http://127.0.0.1:18967 /tmp/compur-report-replay
lsof-who -p 18967 -k
```

The capture script opens a fresh browser context and uses a 1600 × 1000 viewport. It captures CP-03 in plan with the mechanism pane open, the CP-07 and M-11 axonometric sheets, and the editor after copying the M-11 library into A-01. When comparing screenshots, inspect the selected preset, view, body count and visible model. Browser version, fonts and panel layout can alter the pixels.

## Named scripts recovered from temporary storage

The blade, control and timing files are the original investigative versions. Most substitute text into an in-memory copy of a specific historical preset. Read the source substitutions before interpreting the output on another revision. The permanent acceptance checks live one directory above this archive in `scripts/check-blade-aperture.mjs`, `scripts/check-cocking-mesh.py` and `scripts/02-check-home-clearances.mjs`.

| Original location | Recovered files | Use and dependencies |
|---|---|---|
| /tmp/jig-blade | blades/install.py | Historical one-shot generator for early CP-01 and CP-02 and a transformation of their common library. It writes tracked preset files and expects the earlier file layout. |
| /tmp/jig-blade | blades/check.mjs, blades/inspect.mjs | Compile CP-02 and CP-08 with interference diagnostics and inspect component transforms. Start from the Jig repository root. |
| /tmp/jig-blade | blades/diagnose.mjs, blades/pin.mjs | Suppress candidate features one at a time in memory to identify the ring/plate or neighboring-drive-pin contact. Depend on the original feature names. |
| /tmp/jig-blade | blades/optical.mjs, blades/radii.mjs, blades/stroke.mjs | Developmental coverage, outer-radius and intermediate/overtravel checks. The optical lattices use a 25 mm design pupil. |
| /tmp/jig-blade | blades/core-clearance.mjs | Isolate 15 components around the split lens seats and list contacts at the home pose. |
| /tmp | controls/ctrl-gearcheck.py, controls/ctrl-gearcheck-neg.py | Early positive/negative gear sweeps. Require Node, Python and libgeos_c. Their assumed module, centers and phase are hard-coded. The final cocking-mesh checker reads these properties from the builders. |
| /tmp | controls/ctrl-debug.mjs | Historical Candela material-count and shader-size diagnostic. Refers to the original absolute checkout and writes a face metadata dump to /tmp/ctrl-meta.json. |
| /tmp/compur-mec | timing/check.mjs, timing/coupled.mjs | Run from import/jigcad. Apply a +0.05° sector input and inspect ideal train ratios. The coupled variant transforms an intermediate preset’s drive statements. |
| /tmp/compur-report-figs | report/mesh.mjs, report/figures.py | Extract top triangles and draw the plan-view projections and pinion-axis figure. Recovery adds positional directory arguments and supplies the measured coverage to the figure labels. |
| /tmp/compur-report-figs | report/illustrate.py | Historical publication script for the Markdown report and nine assets. It expects the local vault path, original unillustrated text, and an empty destination for each asset. It writes to the vault. |

## Inline scripts

The `inline/` folder contains 47 distinct script bodies recovered from the four prior Compur tool histories. The filenames encode authoring role, UTC time of the tool call and sequence within that role. They include the earlier unsuccessful model and source-edit experiments. Treat these snippets as chronological source evidence. Several edit a historical checkout or depend on temporary files created in the preceding step. The role counts are:

| Prefix | Count | Examples |
|---|---:|---|
| blades | 16 | Compute pin arcs, cut plate features, modify leaf outlines, change the seat geometry, assert the outer radius. |
| controls | 6 | Adjust gear and cam geometry, examine the exported face metadata, update the material appearance. |
| timing | 11 | Create the timing presets, test the ratio chain, change the cartridge seat. |
| lead | 14 | Extract the library, enable module loading, edit project sources and text, derive figure data, take four browser callbacks including the readiness inspection. |

The static extractor `recover-inline.cjs` reads the literal Python or Node heredocs and Playwright callbacks from a nominated Codex JSONL using Acorn. It accepts an output directory, a role, and one original Compur session file. It never executes transcript commands. Each inline file contains the respective interpreter input after JavaScript string decoding. The extractor omits tool wrappers, shell navigation and documents emitted through cat. The screenshot workflow above reconstructs the surrounding navigation and viewport setup. Session logs, raw third-party archive code, generated meshes, transient browser data and unrelated projects are outside this recovery inventory.
