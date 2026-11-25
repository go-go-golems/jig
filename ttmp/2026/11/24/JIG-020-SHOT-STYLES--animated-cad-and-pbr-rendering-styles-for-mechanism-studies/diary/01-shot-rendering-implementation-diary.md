---
Title: Shot rendering implementation diary
Ticket: JIG-020-SHOT-STYLES
Status: active
Topics:
    - cad
    - rendering
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T20:07:41.515904479-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1. Map authorship and create the rendering design

The user asked “ok, create a new ticket, and create a design doc, and ten implement. will the blend and all that be done through code? where are animations defined currently.” I traced the mechanical study, presentation offsets and Candela look through their separate entry points. The same assembly can have three distinct timelines today.

### Decision and implementation

Keep the physical law in the preset's study. Put optional presentation style keyframes beside it in JavaScript and carry data across the worker boundary. Evaluate the camera only once per output frame. The work divides into a Candela color pass, section geometry, shot evaluation and the Stage compositor.

### Review

Inspect SG-09's script.js and meta.json, the preview draw in stage.js, the current workbench exports in stage-render.jsx, and the camera bridge in jig-candela.js. The design records the proposed contract and acceptance checks.
