---
Title: Visual shot timeline implementation diary
Ticket: JIG-022
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:30.264489942-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

Expose the compiled shot as a time ruler with selectable keys, a playhead, editable times and per-key properties. Time is measured in presentation seconds. The shaft phase and constraint solver stay in the existing study. A timing change must survive a reload and be consumed by both preview and export.

### Review instructions

Load SG-09, move a blend key, save and reopen, check the sampled opacity. Try a duplicate time. Verify camera cut and section entries survive a round trip.
