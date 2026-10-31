# Ground and shadow

How the ground is drawn: a 0.5 m / 2 m grid and hatched sun shadows when the camera looks down; a cut ground line over an 18 px hatched band in the elevations.

**Provide** nothing for shadows: every solid loft casts one while the Shadows overlay is on. For the floor, a `floor`-layer view calls `g.grid({ minor: 0.5, major: 2, extent })`; pass `heightAt` to `sheet()` when the ground is not flat.

- The sun is `normalize(-0.5, -1, -0.38)`: 57.9° high, shadows offset 0.628 m per metre of height, falling away from the viewer in the default view.
- All shadows are one path filled once, so overlaps are not darker.
- Shadows and the grid need the camera to look down more than 2.9°; below that the ground line takes over.
- Don't shade a shadow with a translucent grey: hatch it, so the grid stays readable and the dark theme follows the token.
