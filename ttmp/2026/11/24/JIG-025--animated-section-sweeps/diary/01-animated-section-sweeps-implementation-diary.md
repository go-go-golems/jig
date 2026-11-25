---
Title: Animated section sweeps implementation diary
Ticket: JIG-025
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:33.932681224-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

The current section channel selects a fixed plane. A sweep should move its offset in millimetres while the target bodies continue to move. The plane normal and component references stay in local coordinates. A timeline evaluation at a given second must be deterministic in any render order.

### Review instructions

Sample beginning, midpoint, endpoint and after the endpoint. Inspect a bored sleeve at multiple heights, and verify source meshes remain unchanged. Check that distinct section offsets reach the renderer and that a cleared section restores the source.
