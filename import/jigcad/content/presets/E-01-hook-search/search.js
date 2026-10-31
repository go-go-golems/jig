// Arm thickness and width against mass
// A 5 × 3 grid over t and b, each point a fresh compile. capacity is the
// beam proxy of example 42, σ · Z / L with σ = 50 MPa along the layers,
// so it needs no simulation.
const rows = []
for (const t of [4, 5, 6, 7, 8]) {
  for (const b of [15, 20, 25]) {
    const P = await compile(files['script.js'],
      { override: { t: mm(t), b: mm(b) } })
    const arm = 40                                // mm, the lever arm
    const capacity = 50 * (b * t * t / 6) / arm   // N = MPa · mm³ / mm
    rows.push({
      params: { t, b },
      metrics: {
        mass: P.metrics.mass,
        capacity: { value: capacity, unit: 'N' },
      },
      feasible: capacity >= 100,
    })
  }
}
return {
  name: 'Arm thickness and width against mass',
  objective: { minimize: 'mass', require: 'capacity ≥ 100 N' },
  rows,
}
