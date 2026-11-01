---
Title: Saving exports in any page, and from the agent
Ticket: JIG-008-EXPORT
Status: active
Topics:
    - agent
    - export
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: import/jigcad/src/ui/save.js
      Note: browserDownloads, downloads, saveOrCopy
    - Path: import/jigcad/src/ui/app.jsx
      Note: Export menu entries; host.saveFile
    - Path: import/jigcad/src/agent/scope.js
      Note: exportFile({ save })
    - Path: import/jigcad/src/engine/oc.js
      Note: OpenCascade stdout to a ring buffer
ExternalSources: []
Summary: "Exports were computed correctly but could only be saved inside claude.ai; outside it the page now downloads, the agent can save a file for the person, the menu matches the formats, and STEP export is quiet."
LastUpdated: 2026-11-01T11:56:39.256454159-05:00
WhatFor: ""
WhenToUse: ""
---

# Saving exports in any page, and from the agent

## 1. Symptom and cause

In `jigcad serve`, the Export menu greyed out 3MF, and STL, STEP and IR were "copied to the clipboard" instead of
saved. The engine was not at fault. `src/ui/save.js` saved files only through the claude.ai runtime:

```js
export function downloads() {   // before
  … return globalThis.claude?.use ? (await globalThis.claude.use('downloads')) || null : null;
}
```

The workbench was built as a claude.ai artifact, where the frame cannot start downloads and the runtime offers a
`downloads` capability instead. In any other page `globalThis.claude` is undefined, `downloads()` resolved to `null`,
and the menu fell back to the clipboard (text) or refused (binary).

## 2. The engine's exports are correct

`scripts/01-export-all-formats.mjs` compiled A-01 (part), M-07 (assembly, 3 bodies), H-01 (print job, 2 parts) and
S-08 on the engine in Node and exported every format:

| Format | Result |
|---|---|
| STL | binary; size = 84 + 50·n for every file (380 to 22,228 triangles); every directed edge has its twin (watertight, consistently oriented) |
| 3MF | valid zip: `[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model` (unit millimeter, one object and build item per body), `Metadata/jig-settings.json`; every object watertight |
| STEP | `ISO-10303-21;` … `END-ISO-10303-21;`, one `MANIFOLD_SOLID_BREP` per body (AP242, exact B-rep) |
| IR | a .zip (manifest, trace, diagnostics, decisions, params, graph, L0–L6 text) |
| SVG | isometric feature edges (exists in the engine, missing from the menu) |
| DXF, OBJ | not implemented (`unknown export format`) |

The menu also described the IR bundle as "one .json" while it is a zip, and marked it as text, so the clipboard
fallback would have tried to copy a binary zip.

## 3. Design

- **Browser downloads outside claude.ai.** `browserDownloads(doc)` saves with a `Blob` (MIME from the export),
  `URL.createObjectURL`, and a hidden `<a download>` that is clicked and removed; the URL is revoked after a minute.
  `downloads()` uses it when `globalThis.claude` does not exist. Inside claude.ai the runtime capability is used as
  before, and when it is not granted the clipboard fallback stays: the artifact frame cannot download by itself, so
  an anchor click there would fail silently.
- **The menu matches the engine.** SVG added; IR bundle described as a .zip and marked binary. The note under the
  menu says "Files go to your browser's downloads." in a plain page.
- **The agent can hand over a file.** `exportFile(format, { save: true })` exports and calls `host.saveFile`, which
  the Export menu installs, so the agent's file goes through the same path (download, or claude.ai capability, or
  clipboard). The bytes still never reach the model. Saving is allowed in read mode: it changes nothing in the
  workbench. Without a page (the harness) `exportFile(…, { save: true })` fails with
  `exportFile: this workbench cannot save files`.
- **Quiet STEP.** OpenCascade's STEP writer prints a "Statistics on Transfer" banner on stdout, which reached the
  browser console as about 15 log lines per export. `loadOC` passes Emscripten `print` (to a 200-line ring buffer,
  `oc.__log`) and `printErr` (console warnings).

## 4. Verification

- Unit: `test/ui/save.test.mjs` (download of binary and text through a fake document; no document → null;
  stlToASCII) and `test/agent/scope.test.mjs` (exportFile reports without saving; saves through `host.saveFile`;
  refuses without one; allowed in read mode). `make test-js` runs `test/ui` now.
- Browser (Playwright, `jigcad serve`, M-07): every menu item downloaded a file: `gear-pair.stl` (1,111,484 bytes,
  22,228 triangles), `gear-pair.3mf` (3 objects), `gear-pair.step` (3 solids), `gear-pair-iso.svg`,
  `gear-pair-ir.zip` (13 entries), `M-07-gear-pair.js`, byte-identical in size to the Node exports.
- Agent (H-01, glm-5.3-flash): "Give me the pot and saucer as a 3MF file for my slicer." → steps `files.list()`,
  `program.summary()`, `exportFile('3mf', { save: true })` → the browser downloaded `plant-pot.3mf` (2 objects)
  and the answer described both parts.
- STEP export in Node printed no banner after the change.

## 5. Not done

- DXF and OBJ are not in the engine.
- The claude.ai path is unchanged and was not re-tested here (no runtime available).
