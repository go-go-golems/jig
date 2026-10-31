# Chronophotograph

A Marey chronophotograph of the last jump: a violet stick figure every 0.083 s from the hips, feet and deck, older figures fainter.

**Provide** `FormSkateStage.drawChrono(g, samples, every = 0.08)` with `samples = [{ t, hip, ff, rf, deck: { p, q } }]` one every 1/60 s, on the `overlay` layer (as D-03's `lab/chrono.js` does with the history).

- Each figure: a trunk 0.62 m up from the hips, a 2.5 px hollow head, legs from hips to feet, the deck as a 1.6 px `st-blue` line 0.4 m either side of its centre; opacity 0.25 + 0.75 i/n; the hips' path dashed 2 3 at 0.6.
- It reads best in front elevation, where the motion runs across the sheet; in side elevation the figures pile up.
- Don't draw knees or arms: only bodies the physics moves are in the history.
