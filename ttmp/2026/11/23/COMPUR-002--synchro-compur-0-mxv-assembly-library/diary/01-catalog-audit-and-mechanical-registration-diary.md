---
Title: Catalog audit and mechanical registration diary
Ticket: COMPUR-002
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T23:04:27.405733662-05:00
WhatFor: ""
WhenToUse: ""
---

# Catalog audit and mechanical registration diary

## Step 1. Bound the size-0 evidence on plate 7

I opened the entire May 1956 sheet before counting the blade-pack parts. Most of the drawing is headed CN-1110-000. A separate illustration in the lower left is explicitly keyed to CN-1210-000. Counting every label on the page as a size-0 orderable part would conflate the two types.

### Prompt Context

**User prompt (verbatim)**

> Ok, do it, create a new diary and fill it as you go. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)
>
> take screenshots and save all scripts you write in the scripts/ folder. (retroactively too if you wrote scripts that are not committed)

**Assistant interpretation.** Start with the blade assembly audit, investigate the wheel clash and the two cartridge mounts, and preserve evidence and scripts.
**Inferred user intent.** Establish which physical items the model accounts for, and carry corrections forward when their geometry is supported.

### What I did

Created a separate diary and plate reconciliation inside COMPUR-002. Rendered PDF p56 and read the service instructions on the assembly order and screw locking. Assigned parallel work on catalog applicability, dimensional evidence, and recovery of previous temporary scripts.

### Why

The ticket already owns the factory sources, presets and validation scripts. A new diary here keeps the investigation distinct and preserves the earlier chronology.

### What worked

The full sheet shows three screw symbols at the retainer, printed assembly positions 1–5 and a separate size-0 label. The part numbers remain legible with the heading and drawing context in view.

### What didn't work

The archive's text extraction for p56 loses several visible callouts, including 225, and detaches numbers from their leaders. Recovered the associations from the scan.

### What I learned

The circled numbers beside the part identifiers refer to items in the parts-list supplement. The small uncircled numerals beside the blades specify position. Neither set is an orderable part number.

### What was tricky to build

Part 208 appears in both illustrations and part 249 appears in two views of the same base area. Both duplication and a size change can occur on one page.

### What warrants a second pair of eyes

Whether numbers in later supplements establish applicability to the standard -000 shutter. A stock string containing 000 can also occur on a different model's supplement row.

### What should be done in the future

Reconcile each visible callout against its own drawing area and capture enough of the sheet for a second reader to check the boundaries.

### Code review instructions

Start at the new plate reconciliation in reference/. Trace the size-0 inset, then compare M-11's assembly entries and CP-02's five blade instances.

### Technical details

The baseline is Jig revision c4f5aa8. The local scope includes the repair binder, parts-list supplements, the project ZIP, and the existing JigCAD models.

## Step 2. Count actual CAD occurrences and test the proposed axial repair

The plate reconciliation now separates drawing identity, quantity and geometry. After checking the timing mechanism against the existing solids, we could also rule out a specific proposed repair: changing the first wheel's Z alone cannot satisfy both the pin and the next pinion.

### Prompt Context

See Step 1. The first deliverable was a checked blade-assembly count. The next decision was whether the supplied measurements justified moving the first wheel or registering the flash and timer studies.

**Commit (plate audit).** cbcb56a, Audit plate 7 against the Compur blade pack and capture the source and CAD views.

### What I did

- Evaluated both preset entries with the real Jig builders. Grouped the resulting named occurrences by illustration number and checked the blade sequence. Read each leader on p56 and compared the result with the three-digit names.
- Captured the live CP-02 plan and axonometric stage and visually compared them with the entire factory page and the size-0 inset. Used tmux to run the server and lsof-who to stop it.
- Checked the actual wheel polygon, central bore, driving pin and second pinion. Read the common repair instructions for independent operating checks and plate registration landmarks.

### Why

The same part file serves the full shutter and its blade study. Adding their counts would double-count the design. A passing gear-ratio test can also conceal overlapping three-dimensional solids.

### What worked

CP-02 and M-11 both gave 225 ×1, 268 ×1, 208 ×3, 267 ×1, 230 ×0. The drawing shows three fastening screws. The independent wheel check measured 0.300000 mm axial overlap of a pin of radius 0.30 mm wholly within the first wheel profile. Its common volume was 0.084823 mm³.

### What didn't work

A wheel-only vertical correction would need its lower face outside 11.65–13.30 mm to clear the kicker, but inside 11.70–13.00 mm to retain positive overlap with the next pinion. Those conditions have no common solution. The first tmux capture-pane from inside the sandbox also reported “Operation not permitted”; retrying against the server's tmux socket with permission confirmed its port and startup.

### What I learned

Factory operating criteria constrain M/X contact gap and timing and the V run-down interval. They still leave rotation about the mounting axis and axial height unspecified. The metric and inch equivalents printed for the size-0 X threshold disagree; both are recorded in the fit note.

### What was tricky to build

A polygon can surround a circular pin in plan while its central bore removes the apparent intersection. The fit check accounts for the outer polygon and the bore before multiplying the contained disk area by the common thickness.

### What warrants a second pair of eyes

The original screws' dimensions and seats, the axial play of both wheel arbors and the two noncoincident stationary landmarks used to register each cartridge.

### What should be done in the future

Fill the specimen worksheet in reference/fit-wheel-and-cartridge-registration.md. Repeat both the geometric check and the functional timing checks after measuring the actual unit.

### Code review instructions

Run scripts/05-count-plate-7.mjs and scripts/fit-wheel-kicker.mjs with Node from the repository root. Use scripts/03-render-plate-7.sh for the original page. Compare the artwork and the CAD screenshot before interpreting zero distance as a clash.

### Technical details

The study uses the rear threaded flange face as Z zero and positive Z toward the subject. The placement worksheet records the input arbor, second landmark, seat and an independent check point. The collision result pertains to the model at its reference pose.
