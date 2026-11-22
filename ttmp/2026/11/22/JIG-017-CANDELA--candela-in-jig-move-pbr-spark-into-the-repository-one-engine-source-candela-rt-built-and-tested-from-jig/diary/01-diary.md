---
Title: Diary
Ticket: JIG-017-CANDELA
Status: active
Topics:
    - rendering
    - gpu
    - build
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T15:35:23.788644575-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

This diary records JIG-017: moving the Candela renderer (the pbr-spark repository: its TypeScript engine, its own workbench and candela-rt, the native NVIDIA renderer) into jig, so that jig has one engine source, builds and tests candela-rt from its own tree, and the integration is clean. It also records writing the intern guide for that system.

## Step 1: the ticket, the branch, and the repository moved in

This step set up the work and did the one irreversible-looking move: pbr-spark's whole history went into jig at `import/candela` through `git subtree add`. Everything stays on a branch, `jig-017-candela`, stacked on `jig-016-render`, because jig PR #5 is still open.

### Prompt Context
**User prompt (verbatim):** "Ok, create a new docmgr ticket, and integrate and clean up candela to have it cleanly integrated into the system. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"

**Assistant interpretation:** act on the plan given just before:
- move pbr-spark into jig with its history;
- one engine source, deleting jig's vendored copy;
- a clean build of candela-rt from jig, plus CI and release plumbing;
- clean up what the move duplicates or breaks;
- the intern guide, stored in the ticket and uploaded to reMarkable;
- commits and an investigation-format diary throughout.

**Inferred user intent:** stop maintaining two repositories and a vendored copy; make the renderer a first-class part of jig that the next person can understand and change.

### What I did
- Checked the state:
  - jig PR #5 (JIG-016) is open.
  - pbr-spark PRs #2 (candela-rt OptiX shader execution reordering and built-in spheres) and #3 (path ids) are merged.
  - pbr-spark `origin/main` is `e3b799e`: 48 commits, all by one author. Both repositories are public, so importing history publishes nothing new.
- Created branch `jig-017-candela` from `jig-016-render` (`55080ff`).
- `docmgr ticket create-ticket --ticket JIG-017-CANDELA`, then `doc add` for the design doc and the diary.
- Started a research agent on candela-rt's C++ side, read-only: the command line, V8 embedding, GPU paths, the `serve` protocol, the CMake build, and path assumptions that a move would break.
