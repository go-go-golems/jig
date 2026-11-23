---
id: C-02
title: Bokeh and blades
group: Camera
about: Out-of-focus highlights take the shape of the aperture: a disc, or a polygon with as many sides as the iris has blades.
tries: Try 5 blades, then 9|Rotate the blades by 15°
docs: sensor
focus: params
---
# Bokeh and blades

Every out-of-focus point of light becomes an image of the **aperture**. With a perfect circular aperture (`blades(0)`), that is a disc; a real iris is a polygon of $n$ straight blades.

The camera samples the aperture shape directly — a disc, or a regular polygon by triangle sampling — so the highlights are exact, not a post effect.

The fairy lights are small emissive spheres far behind a sharp subject at f/1.4.
