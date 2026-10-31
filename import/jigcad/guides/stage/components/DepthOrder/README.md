# Depth order

What is in front: solids painted back to front in an order chosen by a strategy, with the deck ordered by its plane and each limb drawn as one outline.

**Provide** tags on your solids: a unique `name`; `plane: { n, p0, tol, lean }` on a flat part others stand on; `under: '<name>'` on the parts beneath it; `chain` on the parts of one limb; `bias` (metres) only where geometry cannot decide. Choose a strategy with `sheet(canvas, { order: 'deck plane', chains: true })` (the stage's defaults) or in the Order menu.

- Strategies: `centroid`, `coherent`, `deck plane` (default), `deck plane + coherent`, `deck plane + coherent + smoothed keys`.
- The preview draws one frame both ways with the Truth overlay on: red cells are surface drawn in the wrong order.
- Don't fix an ordering problem with a large `bias`: a bias that is right from one side is wrong from the other.
