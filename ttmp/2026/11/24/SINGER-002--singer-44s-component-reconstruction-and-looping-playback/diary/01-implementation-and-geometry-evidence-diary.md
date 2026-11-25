---
Title: Implementation and geometry evidence diary
Ticket: SINGER-002
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T19:00:35.143224085-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Loop the CAD study and collect the part references

The request was “add loop option. Then, hone in on making a true to life set of presets modeling the different pieecs of the singer mechanism”. I split the work at the playback boundary. Looping remains optional for inspecting mechanisms with end stops.

### What I did

Added Loop to the Stage study transport. Inspected the original movies, family parts list and the 2022 service manual, which explicitly includes the 44S. Retrieved the family list separately from the local 2010 parts list for model 4411.

### Why

A loop may cross a missing row at the cycle boundary. Advancing through the original row order retains that information.

### What worked

Four sample-order tests and a Chromium replay covered looping across a seam, switching Loop off while playing, pausing, and restoring the home pose.

### What didn't work

The earlier flat link silhouettes and the catalog's exploded spacing alone cannot determine assembled depth. Additional traced landmarks are needed.

### What I learned

The A-43 parts drawing distinguishes the take-up lever, its supporter, the supporter shaft and retaining hardware. The footage shows the moving joint between the crank-pin boss and the thread eye.

### What was tricky to build

A slow display frame can cross the seam before the sheet draws a new frame. The check includes both sides of that boundary.

### What warrants a second pair of eyes

Compare the visible lever at two indexed frames before assigning a local eye position.

### What should be done in the future

Record the modeling evidence and independently inspect the revised trajectories.

### Code review instructions

Run the Stage sample tests and scripts/04-check-stage-loop.cjs against the built workbench.

### Technical details

Loop defaults off. Replaying uses the cached component poses; a gap still stops the clock.
