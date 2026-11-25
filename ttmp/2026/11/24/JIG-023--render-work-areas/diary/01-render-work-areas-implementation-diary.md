---
Title: Render work areas implementation diary
Ticket: JIG-023
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:31.660222933-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

Select a contiguous interval of a shot and render that interval at production cadence. Artists can inspect the hook pass without tracing the entire study. Preview, video and remote jobs must agree on which absolute frame belongs at the start.

### Review instructions

Compare the first and last images of a subrange to those same frames in the full shot. Test invalid ranges and a one-frame range. Verify decoded frame count and check an OptiX work-area render.
