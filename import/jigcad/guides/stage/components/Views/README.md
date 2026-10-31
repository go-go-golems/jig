# Views

The four named views of the sheet: axonometric, front elevation, side elevation and plan, all orthographic.

**Provide** a view key and a scale or zoom: `FormSkateStage.sheet(canvas, { view: 'side', zoom: 1 })`, or in a library view nothing at all (the stage chooses). `VIEWS[key]` gives `{ name, short, yaw, pitch }`.

| key | name | yaw | pitch |
|---|---|---|---|
| `axo` | Axonometric | 38° | 27° |
| `front` | Front elevation | 0° | 0° |
| `side` | Side elevation | −90° | 0° |
| `plan` | Plan | 0° | 90° |

- Do check a new view or prop in all four. The elevations have no shadows and show a ground line; the plan shows no height.
- Do keep the views orthographic. Orbit adds to yaw and pitch; it never adds perspective.
- Don't invent other named views. Track and orbit already turn any of the four.
