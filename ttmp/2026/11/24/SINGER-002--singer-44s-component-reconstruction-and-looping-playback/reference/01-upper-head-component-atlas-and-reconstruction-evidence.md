---
Title: Upper head component atlas and reconstruction evidence
Ticket: SINGER-002
Status: active
Topics:
    - cad
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/content/presets/SG-03-upper-head/singer.parts.js
      Note: Shared head geometry and service-height motion law
    - Path: repo://import/jigcad/content/presets/SG-06-presser-foot/presser.parts.js
      Note: Presser, shank, spring and foot geometry
    - Path: repo://ttmp/2026/11/24/SINGER-002--singer-44s-component-reconstruction-and-looping-playback/sources/source-figures.tsv
      Note: Indexed original reference photographs and movie frames
    - Path: repo://ttmp/2026/11/24/SINGER-002--singer-44s-component-reconstruction-and-looping-playback/sources/workbench/index.tsv
      Note: Workbench camera and body counts
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T19:00:35.288566185-05:00
WhatFor: ""
WhenToUse: ""
---

# Singer 44S upper-head component atlas

The eight presets share component definitions. SG-03 contains one needle bar and combines the needle drive, gate, presser and take-up hardware. Each isolated study reuses the geometry visible in the combined model. The housing is represented by local bearing references, and the plate supplies the needle-opening datum. The model covers the upper stitch head. The lower hook, bobbin, four-motion feed, tension system and selector train require additional reconstruction.

| Preset | What to inspect | Figure |
|---|---|---|
| SG-01 | Centered needle drive over one shaft revolution | [Front](../sources/workbench/SG-01-needle-drive.png) |
| SG-02 | Needle sliding within the swinging guide | [Front](../sources/workbench/SG-02-needle-swing.png) |
| SG-03 | 29 bodies in the assembled head. Select Play and Loop in Stage. | [Axonometric](../sources/workbench/SG-03-upper-head.png) |
| SG-04 | Five separate pieces including the needle, clamp, thumb screw, bar and drive bracket | [Detail](../sources/workbench/sg-04-axo-detail.png) |
| SG-05 | Two line-bored bearing lands and the transverse gate pin | [Exploded](../sources/workbench/SG-05-swing-support.png) |
| SG-06 | Lower and upper spring seats, clamp, lifter, shank and foot at the service height | [Axonometric](../sources/workbench/SG-06-presser-foot.png) |
| SG-07 | Both take-up lever pivots, thread eye, supporter, clips and shaft | [Detail](../sources/workbench/sg-07-front-detail.png) |
| SG-08 | Left-side needle rise before lateral transfer | [Service setup](../sources/workbench/SG-08-zigzag-timing.png) |

## Source-to-CAD comparisons

**Needle and clamp.** The rear flat, through-eye, front groove and rear scarf are features of the modeled NM90 needle. The comparison with a manufacturer's 130/705 H dimensional drawing gives a 2.04 mm shank and a 33.9 mm butt-to-upper-eye distance. NM90 is the representative size selected for CAD; its presence in the photographed machine is unverified. Singer's plate E distinguishes the supporter, pin, bar, clamp and screw. The photographic crop shows the paddle and rim notch on the thumb screw. [Hardware evidence and dimensional conventions](02-needle-holder-and-swinging-guide-reconstruction.md)

**Presser foot.** Singer service procedure 3-4 gives a 6.0–6.2 mm setup gauge. The isolated preset opens at the midpoint, 6.1 mm above the plate. The combined preset opens with the sole on the plate. The spring seat changes height when the geometry is rebuilt with the hand lift raised. The current study uses fixed shaft-independent settings for the presser. The solid spring carries no stiffness or force calibration. [Gauge illustration](../sources/presser-foot-gauge.jpg) · [Plate E](../sources/presser-plate-E.jpg) · [Plate E part numbers](../sources/presser-plate-E-list.jpg)

**Take-up.** Singer plate A identifies the lever (32), supporter (33), two clips (34) and supporter shaft (35) in assembly 43. In the long movie, I registered the thread eye to the crank pin and the support pin. With their projected separation as unit length, the eye lies at (2.00, −1.08) in the 2 s view and (2.11, −0.99) in the 8 s view. SG-07 uses the first projection and a nominal 22 mm between pins. This fixes the observed side and reach of the eye. Differences between projections reflect viewpoint and landmark uncertainty. The eye guard remains a reconstruction of its visible outline. [Factory drawing](../sources/plate-a-43.png) · [2-second landmarks](../sources/annotated-linkage-02s.jpg) · [8-second landmarks](../sources/annotated-linkage-08s.jpg) · [Coordinates](../sources/takeup-landmarks.tsv)

**Zigzag timing.** Procedure 3-5 specifies a 3–5 mm needle-point height at the left extreme on the rising stroke, using stitch width dial 6. The model chooses 5 mm. SG-08 starts at that event. The calculation finds the shaft angle at which the tip reaches the target height with the gate held at its extreme. Between dwell intervals the model uses a cosine. The symmetric return timing and the nominal ±3 mm crossing at the plate are assumptions. Dial divisions alone cannot calibrate the cam shape. [Service illustration](../sources/service-needle-flow.png)

## Fit and uncertainty

The earlier mixed assemblies had intersecting solid envelopes even while the pin equations closed. A nine-pose audit found 93 intersections above the test threshold. The most severe was approximately 220.52 mm³ between the crank and pressure regulator. Revisions included a separate shaft bearing, a revised axial stack and grooves for the retaining clips, and moving the presser axis away from the gate hinge. The adopted 22 mm offset, the shaft axis placement and the simplified bearing carrier are fit estimates. These are priority measurements for the specimen.

At the final revision, 49 full-head poses spaced 15° apart passed the all-pairs common-volume test with a threshold of 0.001 mm³. The broad-phase bounding-box filter discards overlaps thinner than 0.0001 mm along any one axis. The 145-pose motion check tested rod and supporter closure independently. The largest planar residual was 1.73e-9 mm. These checks qualify the specific CAD arrangement and sampled poses; physical bearing clearances, shaft end play, unobserved depths and motion between samples still require evidence. [Initial collisions](../sources/assembly-fit-initial.tsv) · [Final audit](../sources/assembly-fit.tsv) · [New trajectory](../sources/reconstructed-trajectory.tsv)

## Figure sources for the vault report

The [source figure index](../sources/source-figures.tsv) maps the 13 original photos and 20 selected movie frames to their archive names and timestamps. The [checksum manifest](../sources/archive-manifest.tsv) records the two full movies for later re-extraction from singer-videos.zip. The contact sheets retain the actual presentation timestamps. [Short movie](../sources/video-1-contact-sheet.jpg) · [Long movie](../sources/video-2-contact-sheet.jpg)

The [workbench index](../sources/workbench/index.tsv) records the preset, camera, compiled features and body count for each of the twelve CAD images. Reference images and generated CAD images are stored separately. The [implementation diary](../diary/01-implementation-and-geometry-evidence-diary.md) records the geometry revisions that distinguish these captures from the first Singer study.

The family parts book explicitly lists 44S. Its downloaded PDF has SHA-256 43d3949b1fea2177859893a72ce6b4b7d7d5ebcab4c9a9e01310f635764de0f9. The local Singer service manual, 104 73 14-26 dated 2022-11-08, has SHA-256 8a8008a34bf8221f4df570dcd3d9d7001ce0e360f0b4f8025990234d85b3e281. Use its printed page numbers for citations; the PDF page index is one page later in the adjustment sections. [Singer family parts book](https://site.singeronline.com/ssl/instructions/Sgr_4411_4423_4432_4452_44S_5511_5523_5532.pdf)
