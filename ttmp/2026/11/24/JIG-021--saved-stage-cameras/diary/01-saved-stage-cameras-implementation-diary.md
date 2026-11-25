---
Title: Saved Stage cameras implementation diary
Ticket: JIG-021
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:28.706428958-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

An inspection of the hook needs a repeatable close-up. Capture the resolved Stage camera after orbit, pan and zoom. Store the world target in millimetres, resolved yaw and pitch in radians, and vertical field height in millimetres. Pixel scale alone would change the framing when the canvas height changes.

### Review instructions

Save an off-centre axonometric view, change projection, recall it, then render at two sizes. Compare normalized projections and check persistence after reopening the project.
