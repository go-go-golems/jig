# Search a wall hook

A J-shaped hook: a plate against the wall, an arm 40 mm out from it, a 12 mm tip turned up, each one extrude joined to the last. The question is how thin and how narrow the arm can be before it is too weak, and what that saves in plastic.

> **Try it.** [Run the search](lab:exp/search.js), click the lightest feasible row to load it, then [look at it from the side](lab:view/stage?view=side).

## The proxy

There is no simulation in the print suite, so strength is a proxy: the bending capacity of the arm's root, $F = \sigma Z / L$ with $Z = b t^2 / 6$. With σ = 50 MPa along the layers, a 6 mm arm 20 mm wide holds 150 N at 40 mm.

## The search

`search.js` compiles fifteen points, five thicknesses by three widths, and returns their mass and capacity. Points under 100 N are not feasible; the table ranks the rest by mass.

> **Exercise.** Add `arm` to the grid and see whether a shorter arm buys a thinner one. Then round the inside corner where the arm meets the plate with a fillet, and check that the search still runs.
