---
Title: 'KeyShot-style rendering for jig: Candela as jig''s renderer, a CAD package from jig, and candela-rt as an NVIDIA sidecar'
Ticket: JIG-016-RENDER
Status: active
Topics:
    - rendering
    - gpu
    - cad
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: abs:///home/manuel/code/wesen/2026-11-21--pbr-spark/tools/lockstitch/convert.py
      Note: the offline converter the CAD package replaces
ExternalSources: []
Summary: "Design and phased plan for photographic rendering in jig with Candela: a bridge joining jig faces and components to Candela by name, a CAD package export, appearance in jig, a Render view, study poses, candela-rt as an NVIDIA sidecar, and the repository merge."
LastUpdated: 2026-11-22T00:48:09.555916575-05:00
WhatFor: ""
WhenToUse: ""
---

# KeyShot-style rendering for jig: Candela as jig's renderer, a CAD package from jig, and candela-rt as an NVIDIA sidecar

## Overview

Photographic, KeyShot-style rendering for jig using Candela, the team's path tracer, which has a CAD path and an OptiX runtime called `candela-rt`. The work is design only so far; nothing is implemented.

- **Design and intern guide:** [design-doc/01](design-doc/01-rendering-jig-with-candela-intern-guide-design-and-implementation-plan.md). It covers:
  - jig and Candela background;
  - the bridge API (`jigScene`, `component#face` addresses, `faceAt`);
  - the CAD package;
  - process inference and `.finish()`;
  - the Render view;
  - poses from studies;
  - the `candela-rt` sidecar;
  - repository packaging and the merge;
  - phases 0–6, tests and decisions D1–D9.
- **Diary:** [diary/01](diary/01-diary.md), with the evidence and the review notes behind the revision.
- **Evidence script:** `scripts/01-f06-face-records.mjs` prints preset F-06's body and face records from jig's worker in Node.

The ticket's directory name keeps the old term "scene package". The doc calls jig's export the *CAD package*, because Candela already uses "scene package" for its post-compile OptiX format.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- rendering
- gpu
- cad

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
