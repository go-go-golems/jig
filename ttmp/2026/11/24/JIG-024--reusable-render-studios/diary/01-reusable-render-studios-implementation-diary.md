---
Title: Reusable render studios implementation diary
Ticket: JIG-024
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:32.717050581-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

A named studio collects rendering choices for repeated use. Lighting, material assignments, background and exposure affect the surface pass. Keep them separate from the assembly definition so switching a studio reuses occurrence geometry and motion.

### Review instructions

Create two visibly different looks, switch between them, reload and compare. Confirm fixed exposure persists across frames and that shader or material changes use the chosen scene settings.
