# Trail

The last jump drawn as onion skins: a ghost deck every 1/12 s fading in, the centre's path with 50 ms ticks, and the nose's dashed path.

**Provide** nothing in the workbench (the Trail overlay; `g.trailSpan()` gives the window). Outside it, `FormSkateStage.drawTrail(g, samples)` with `samples = [{ t, p, q }]` one every 1/60 s, on the `ghost` layer.

- Window: take-off to landing (or bail) plus 0.1 s, kept for 6 s.
- Ghosts: every fifth sample from the window's start; at most 18; 0.8 px `st-ghost` at opacity 0.18 + 0.5 (i + 1)/n.
- Paths: centre 1.2 px `st-blue` at 0.85 with 1.6 px ticks; nose 0.8 px `st-teal` at 0.6, dashed 3 3.
- The preview's motion is example data shaped on the book's running kickflip.
- Don't depth-sort ghosts or give them trucks and wheels: they lie under every solid.
