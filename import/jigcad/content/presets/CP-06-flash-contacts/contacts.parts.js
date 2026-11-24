// Lesson 9, figures 81–82 and 109–111. Schematic local millimetre scale.
// XY origin is the common pivot. Z is towards the sync bridge.
const zPlane = z => j.plane.offset(j.plane.XY, mm(z))
const plate = (name, colour, profile, z, thickness) =>
  j.part(name).color(colour)
    .extrude(profile.on(zPlane(z)), mm(thickness), { id: 'plate' })
const pivot = j.region.circle(0.72)
return {
  mCloser() {
    const outline = j.region.circle(1.24).union(j.region.polygon([
      [-0.5, 1], [-2.1, 0.8], [-3.25, 0], [-3.15, -0.6], [-0.4, -1]
    ])).subtract(pivot)
    return plate('M-closing lever', '#9ba3a9', outline, 0, 0.3)
      .extrude(j.region.polygon([
        [-2.6, 0.18], [-2.1, 0.42], [-2.0, 0.16], [-2.52, -0.08]
      ]).on(zPlane(0.3)), mm(0.25), { id: 'hook' })
  },
  contact() {
    const outline = j.region.circle(1.2).union(j.region.polygon([
      [0.6, 0.9], [-0.9, 1], [-2.85, 0.2], [-3.0, -0.35], [-0.5, -1]
    ])).union(j.region.polygon([
      [-2.7, 0.15], [-2.98, -0.2], [-4.9, 2.75], [-4.64, 2.9]
    ])).subtract(pivot)
    return plate('Contact lever', '#d0b36c', outline, 0.65, 0.22)
      .extrude(j.region.circle(0.23, { at: [-2.55, -0.18] })
        .on(zPlane(0.34)), mm(0.32), { id: 'downwardLug' })
  },
  groundStrip() {
    return plate('Housing grounding strip', '#b78c55', j.region.polygon([
      [1.4, -2.9], [1.75, -2.9], [0.9, -0.65], [0.62, -0.88]
    ]), 0.6, 0.18)
  },
  terminal() {
    return plate('Socket terminal strip', '#c79e5b', j.region.polygon([
      [-6.1, 3.8], [-6.35, 3.55], [-5.22, 2.8], [-5.03, 2.99]
    ]), 0.68, 0.18)
  }
}
