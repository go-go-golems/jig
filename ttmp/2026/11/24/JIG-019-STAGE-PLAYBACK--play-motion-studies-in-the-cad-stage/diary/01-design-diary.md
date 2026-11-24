---
Title: Design diary
Ticket: JIG-019-STAGE-PLAYBACK
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T10:48:30.879707867-05:00
WhatFor: ""
WhenToUse: ""
---

# Design diary

## Step 1. Trace a study sample from the worker to the sheet

The request was “Craete a new docmgr ticket for the play option, create a design doc.” I inspected the native slider-crank study, worker dispatcher, assembly pose storage, Stage toolbar and transient drawing path. The existing worker keeps CAD-frame matrices indexed by valid study row. The Stage already accepts component transforms for joint dragging. This made a read-only track fetch the smallest implementation boundary.

I recorded the interaction behavior, stale-result handling, gap policy and validation fixtures in the design. The Singer solves several joint values from one shaft angle, so its authoring support is a separate milestone that can reuse the same player. This checkpoint is a documentation change.
