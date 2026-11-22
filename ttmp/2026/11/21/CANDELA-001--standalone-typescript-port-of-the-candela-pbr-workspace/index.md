---
Title: Standalone TypeScript port of the Candela PBR workspace
Ticket: CANDELA-001
Status: active
Topics:
    - pbr
    - typescript
    - webgpu
    - port
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/candela/scripts/validate.ts
      Note: Preset build validation gate
    - Path: repo://import/candela/src/app/main.tsx
      Note: Workbench entry point
    - Path: repo://import/candela/src/content/catalog.ts
      Note: Content catalog (port of build/build.js preset/doc loading)
    - Path: repo://import/candela/vite.config.ts
      Note: Build configuration (multi-file and single-file)
ExternalSources:
    - local:candela-workspace.zip
Summary: "Candela PBR workbench (claude.ai artifact, JS) ported to a standalone Vite + TypeScript app at the repo root; tsc clean, presets validate identically, agent on the Anthropic SDK."
LastUpdated: 2026-11-21T19:16:31.133038802-05:00
WhatFor: ""
WhenToUse: ""
---

# Standalone TypeScript port of the Candela PBR workspace

The imported archive (`sources/candela/`, zip archived at `~/data/pbr-spark/candela-workspace.zip`) is ported to
a Vite + TypeScript app at the repository root. Start with the repository `README.md`.

- Plan and decisions: [design-doc/01-typescript-standalone-port-plan.md](design-doc/01-typescript-standalone-port-plan.md)
- Diary (5 steps, with failures and evidence): [log/01-diary.md](log/01-diary.md)
- Evidence: `various/01-baseline-validate-original-js.txt` (original), `various/02-final-validation.txt` (port)
- Codemods used for typing: `scripts/01-…`, `02-…`, `03-…`
- Tasks: [tasks.md](tasks.md) · Changelog: [changelog.md](changelog.md)
