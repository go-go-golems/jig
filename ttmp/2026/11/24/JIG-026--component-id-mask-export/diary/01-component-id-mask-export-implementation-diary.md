---
Title: Component ID mask export implementation diary
Ticket: JIG-026
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:35.296913339-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

An editor needs to select an individual occurrence at a specific movie frame. Allocate stable RGB identifiers from the source occurrence list and reserve black for background. An isolated or hidden item must keep its identifier for later frames. A cap belongs to its cut occurrence.

### Review instructions

Check masks against a scene containing overlapping moving components, an isolated component and a cut surface. Decode PNG and verify every non-background pixel has a declared occurrence. Compare silhouette and projection against the ordinary Stage pass.
