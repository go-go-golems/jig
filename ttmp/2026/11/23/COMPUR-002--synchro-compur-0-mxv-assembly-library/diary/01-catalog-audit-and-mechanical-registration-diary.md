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
