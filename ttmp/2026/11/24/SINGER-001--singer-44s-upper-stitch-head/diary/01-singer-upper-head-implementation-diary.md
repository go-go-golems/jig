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

## Step 2. Solve the shared needle drive and thread take-up linkage

All three workbench entries import singer.parts.js. SG-03 owns the definitions. SG-01 and SG-02 use relative symbolic links so changing the bar updates all three at the next web build. The evidence checkpoint is adf4e15.

### Prompt Context

See Step 1. The full upper-head study places one bar inside the swinging guide and attaches the needle clamp to that bar.

### What I did

Built a shaft crank and connecting rod, a prismatic bar inside a revolving gate, a fixed needle clamp, a needle envelope, and a crank-driven take-up lever on a rocker. The needle-drive and swing studies expose subsets of the combined assembly.

### Why

The sliding and swinging motions operate in different coordinate frames. Placing the slide joint on the gate makes the bar, clamp and needle follow the gate when it tilts.

### What worked

The real Jig compiler reported eight, six and ten bodies for SG-01, SG-02 and SG-03. Two local filenames resolve to the same canonical library. The pose solver found rod and supporter closure in 73 compiled poses, ten degrees apart, over two revolutions.

### What didn't work

The first elbow-to-eye extension placed the eye on the opposite side of the drive and produced a higher eye at needle bottom than at needle top. I changed the branch extending from the drive joint and reran the world-coordinate checks. The outward branch and its bend remain estimates.

### What I learned

A linkage can close exactly even with the thread eye on the wrong extension. The eye has no influence on link closure, so its path needs a separate check.

### What was tricky to build

The rod length must remain constant even as the slide axis tilts. Projecting the crank pin onto the gate axis and solving the remaining right triangle determines the slide position. Two-circle intersection locates the take-up elbow. Joint angles are converted from world headings to their parent link frames.

### What warrants a second pair of eyes

Measure the actual phase between the crank throws, verify the side of each link and identify the cam dwell. Check depth, bearing seats and moving clearances independently.

### What should be done in the future

Record a handwheel-indexed turn with a scale in the same plane as the head linkage. Measure the eye and needle at the same shaft positions.

### Code review instructions

Open SG-03-upper-head/singer.parts.js and follow pose(), assemble() and swingAt(). Run node scripts/02-check-cycle.mjs from the repository root using the ticket-relative script path. Read the emitted TSV to compare the solved eye and tip locations.

### Technical details

The centered ideal stroke is twice the 12 mm crank radius. For a 2-degree gate command the solved tip positions at successive penetrations are approximately +2.65 and -2.65 mm. The gate changes sides around needle top and dwells around penetration. These are CAD outputs for the chosen dimensions.
