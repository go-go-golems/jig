# Five-leaf diaphragm

The diaphragm sets the lens aperture. It sits behind the exposure blades shown in [CP-02](lab:preset/CP-02). The archive's iris is a single annulus, 24 mm across its opening and 0.6 mm thick in Z. This study fits five separate leaves between two covers inside those limits. Hide the covers to inspect the leaves. Each one has a bearing pin on the front and a guide pin on the rear.

Compur's spare-parts supplement sheet 13 (September 1973) specifies five enameled diaphragm blades 105 when fitting a replacement index-88 housing 101. The size-0 parts family includes 1210 10 000 105. Plate 8 on the manual's PDF page 57 illustrates 105 between blade cover 116 and slotted diaphragm cover 106, above housing 101, with operating ring 108 on the opposite side. Its heading specifies CN-1110-000, the size-00 relative. This establishes a comparison for the construction; the drawing does not give size-0 plate geometry. The November 1956 size-0 specification on PDF page 9 gives the 24 mm opening.

The five angular positions, profiles, pin and slot dimensions, Z offsets and material finish in this study are estimates. The CAD describes a single full-open setting. Setting-ring travel, slot curves, fasteners and the iris calibration require measurements on the specific variant. The complete M-11 uses the archive's envelope for the diaphragm.

To reuse one leaf, load `diaphragm.parts.js` and call `leaf(i)` with an index from zero through four. Each factory places the pins and leaf in the common shutter coordinates in millimetres.

The front and rear lens seats in [CP-01](lab:preset/CP-01) straddle Z 9.2–9.8 mm, leaving the diaphragm plane open. This preset checks all 21 component pairs for touch or overlap at the full-open pose on every rebuild.
