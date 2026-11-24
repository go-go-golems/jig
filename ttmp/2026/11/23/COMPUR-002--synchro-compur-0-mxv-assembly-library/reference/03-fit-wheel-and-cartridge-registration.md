---
Title: Escapement fit and cartridge registration record
Ticket: COMPUR-002
Status: active
Topics:
    - cad
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/23/COMPUR-002--synchro-compur-0-mxv-assembly-library/scripts/fit-read-plates.sh
      Note: Factory evidence and acceptance criteria
    - Path: repo://ttmp/2026/11/23/COMPUR-002--synchro-compur-0-mxv-assembly-library/scripts/fit-wheel-kicker.mjs
      Note: Home-pose interference and axial feasibility
ExternalSources: []
Summary: Reproduced home-pose collision, source limits and datum requirements for the size-0 M/X and V mechanisms.
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Escapement fit and cartridge registration

## Wheel 1 and the retard lever

At the existing home pose, **0.084823 mm³** of the retard lever's driving pin lies inside the first wheel. The result comes from the two actual named extrusion profiles, including the wheel's teeth and bore. The entire 0.30 mm radius pin disk lies inside the wheel's material. Its nearest edge-to-outline distance is 0.343240 mm and its edge-to-bore distance is 1.887352 mm. The axial intervals overlap for 0.30 mm, giving a common volume of π × 0.30² × 0.30. This is a collision before the train moves. [Reproduce with Node from the Jig repository root](../scripts/fit-wheel-kicker.mjs).

| Modeled extrusion | Lower face, mm | Upper face, mm |
|---|---:|---:|
| Segment tooth sector | 11.95 | 12.25 |
| Wheel 1 | 11.95 | 12.25 |
| Pinion on the wheel-1 arbor | 11.60 | 12.60 |
| Kicker on lever 341 | 11.95 | 13.30 |
| Pinion on the wheel-2 arbor | 12.00 | 13.00 |
| Wheel 2 | 12.35 | 12.65 |

With wheel thickness 0.30 mm and all other geometry fixed, the wheel's lower face L must satisfy **11.70 < L < 13.00 mm** to retain any positive axial engagement with pinion 2. To separate it from the pin it must instead have **L < 11.65 mm or L > 13.30 mm**. At either boundary the flat surfaces touch. The intervals are disjoint. A vertical shift of this wheel alone cannot repair the model, even before checking the other working pairs. A change to a pin profile, an arbor stack, or their XY relationship would require different evidence.

Factory PDF p54, plate 5, shows the size-00 escapement 300 seated on the mechanism plate with screws 304 and 323, followed by an exploded projection of the train. The common repair instructions on pp132–133 include the size-0 target in the heading and describe adjustment by rotation of the assembly about screw 304. They specify pallet engagement of one-third to one-half tooth height in the stated lever-plate adjustment. The projection and this radial adjustment do not supply signed wheel-face heights on a size-0 specimen. The design archive's chapter 13, §5 identifies the same wheel layer conflict. Its generated scripts and STEP descend from that design.

## Measurement record to complete

Record the body's full type number, camera installation, revision/index markings and the shooting direction of each photograph. Use the rear threaded flange face as axial zero, +Z toward the subject, and the optical axis as the XY origin. Define the positive X direction against a second marked, stationary landmark and keep the same angular convention throughout. If only a dismounted cartridge is available, reference its measured mounting seat and record its installed Z separately. For each measurement record value in mm, uncertainty, instrument, photograph and pose. All specimen observations below remain outstanding.

| Feature | Required specimen measurements | Decision |
|---|---|---|
| Cartridge 300 | Installed seat Z and two fixing locations, axial separation of inner plate faces, as-found setting about screw 304 | Register the cartridge to the fixed mechanism plate and preserve the as-found speed adjustment |
| Wheel 1 / pinion 1 and wheel 2 / pinion 2 | Both faces of each toothed band from the same seat, shoulder direction and axial play at each arbor | Establish the axial order and available working mesh across play |
| Lever 341 and driving pin | Arbor center, pin center and radius, top and bottom Z, and its path relative to both tails | Establish clearance from wheel 1 while maintaining the two intended contacts |
| M/X mechanism | Contact post and seat, terminal mounting point, brush/strip heights, bridge attachment, cocked M and full-open X poses | Locate CP-06 in the body and identify the actual terminal/contact pair |
| Timer 400 | Lower cartridge seat, input arbor, second identifiable stationary hole or arbor, retaining screw and 421-to-202 engagement | Register CP-07, check screw location independently and recover linkage geometry |

For each cartridge, identify a local landmark A and a second landmark B in the same plane and measure their assembled XY positions. With parallel +Z axes, the rotation is the difference between the bearings of A→B in the two frames. Translation is the target position of A minus its rotated local position. The Z translation is the measured seat height minus its modeled height. Check the distance A–B against combined measurement uncertainty before fitting. A discrepancy can expose a wrong landmark, revision or an inaccurate local teaching model. An extra measured point C tests the fitted transform independently. If the supporting planes are tilted, measure the face normal or three noncollinear seat points before constructing the 3D transform.

CP-06 places the common contact post at its local origin. CP-07 uses its **input arbor** for the local origin and places the first-end screw at (3.5, −1.95) mm. These are construction coordinates. The single fixing screw alone leaves the orientation undetermined. The fixed base plate 201 carries lever 696, anchor plate 627, detent lock 664 and V-detent 421 according to the common repair instructions (PDF p135, item 9). Their attachments identify additional physical landmarks to measure. Factory plate 4 on p53 and plate 6 on p55 illustrate the flash and timer assemblies for CN-1110-000. Neither drawing verifies a precise spatial transform for CN-1210-000.

## Functional checks after registration

The common instructions give bench criteria independent of the model's chosen geometry. The assembly seat and axle dimensions above remain necessary even when these criteria are met.

- **M setting.** Factory PDF p135, item 11 specifies a cocked contact gap of at least 0.5 mm. Test continuity during release and measure the interval from contact closure to the aperture becoming half open. The scan prints 16½ ms ±10% (14.85–18.15 ms). The accompanying minimum M-contact load is 10 gram-force.
- **X setting.** The same section gives a minimum contact load of 60 gram-force. For size 0 the metric text places closure between a 22.0 mm aperture circle and full aperture. Its printed parenthesis reads 0.778 inches, approximately 19.76 mm. These disagree; retain both readings and verify with another edition before qualifying a specimen. Fig. 8 on p58 shows the X setting. Adjusting the spring 615 affects closure. A force value cannot establish the assembled position of its pivot.
- **V setting.** Factory PDF p134 describes an 8–10 s timer run-down and adjustment of eccentric 298 between lever 421 and ring 202. Verify that the blade ring is free with the timer out of operation. The English sheet also gives a maximum one-second residual run after shutter release. Distinguish release of the shutter drive from starting the timer when interpreting that observation. CP-07 represents only the input and pallet ends of the train and has no elapsed-time prediction.

The source plates can be rendered with the [plate reader script](../scripts/fit-read-plates.sh). The relevant factory figures are on printed plate 9 (PDF p58), including the escapement pivot, V eccentric and contact gap. The archive's Lesson 9 photographs supply companion views of the smaller 00 movement. No measured size-0 axial stack, third registration landmark or bench trace was identified during this review.
