---
id: L-09
title: Three-point lighting
group: Light
about: Key, fill and rim on a bust: the classic portrait setup, with the lighting ratio as a param.
tries: Set a 4:1 key-to-fill ratio|Make it Rembrandt lighting|Take a screenshot and critique the lighting like a cinematographer
docs: units, sensor
focus: params
---
# Three-point lighting

- **Key** — the main light, 45° to the side and above.
- **Fill** — softer, on the other side, to lift the shadows. The **lighting ratio** is (key + fill) : fill on the two cheeks; 2:1 is flat, 4:1 is dramatic, 8:1 is film noir.
- **Rim** — behind and above, to separate the subject from the background with a bright edge.

Because light transport is **linear** in emission, the ratio is set by the fill's power alone: halving the fill raises the ratio. The params do exactly that.

> **Try it.** Ask the agent: "measure the lighting ratio on the face and set it to 4:1". It can meter both cheeks with `render.meter(x, y)`.
