---
Title: Singer upper head implementation diary
Ticket: SINGER-001
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T09:53:22.115035374-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the evidence and assembly boundary

I created SINGER-001 for the upper-head study and extracted two stills and four video frames before building geometry.

### Prompt Context

**User prompt (verbatim)** “ok, do it.”

**Follow-up (verbatim)** “commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

Create  anew docmgr and als keep screenshots not just of your work, but the original information you extract out of the images.”

I interpreted this as implementing the shared needle-drive, swing and combined upper-head studies discussed immediately before the request.

### What I did

Created the ticket, added the reference and diary, and saved the extraction commands under scripts/01-extract-source.sh.

### Why

Stills identify the joints and video frames show different configurations. Together they support a kinematic study.

### What worked

The named members of singer-videos.zip decoded with ImageMagick and FFmpeg.

### What didn't work

There is no in-plane length reference in the supplied close-up.

### What I learned

The lever eye and the needle attachment are visible, while their depth separation remains uncertain.

### What was tricky to build

The camera moves during the long clip. Matching pixel coordinates across those frames would mix camera and linkage motion.

### What warrants a second pair of eyes

Check the hidden shaft pin locations against an exposed end-on view.

### What should be done in the future

Measure the stroke and pivot centers with the bar centered.

### Code review instructions

Replay the extraction script against the original archive. Compare each output with its caption in the source reference.

### Technical details

Time offsets are seconds from the start of the named movie. Photos use EXIF orientation. Original image proportions are preserved.
