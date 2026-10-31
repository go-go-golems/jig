---
part: V · Inside the solver
presets: A-03
docs: solver
---
# Decomposition and dragging

A real sketch has hundreds of unknowns, but most constraints touch two or three of them, so the system falls apart into pieces that can be solved one at a time. This chapter covers why splitting pays off and how jig does it, and sets jig's method against finer decompositions: bipartite matching with the Dulmage–Mendelsohn decomposition, and graph-constructive solvers. The second half treats dragging as an optimisation problem, checked with measured drags: move one point toward the pointer, keep every constraint, change as little else as possible. By the end you can predict a sketch's clusters from its constraints, work out by hand where a drag will move each entity, and say when a drag will flip a sketch onto another solution.

## 15.1 Why decompose

Chapter 13 solves $g(x) = 0$ for all $n$ unknowns at once. Every iteration factors the $m \times n$ Jacobian by a rank-revealing QR. jig stores that matrix dense, and a dense QR costs about $m n^2$ operations. Double the sketch and each iteration costs eight times as much. But the Jacobian of a sketch is almost empty. A horizontal constraint involves 2 coordinates and a coincidence 4, so a row has a handful of nonzeros out of hundreds of columns.

The measurement below uses $N$ copies of a 20 × 10 mm rectangle, each drawn 10 % off-size so the solver has work to do. In the *separate* version each rectangle has its own fixed corner. In the *linked* version only the first is fixed, and each other corner is placed 30 mm from its neighbour by a `distanceX` and a `distanceY`. Both versions have the same $n$, the same number of equations and full rank, and both converge in 2 iterations.

| $N$ | $n$ | separate: clusters, time | linked: clusters, time |
|--:|--:|---|---|
| 20 | 320 | 20 clusters of 16, about 8 ms | 1 cluster of 320, about 90 ms |
| 40 | 640 | 40 clusters of 16, about 14 ms | 1 cluster of 640, about 650 ms |

The times are typical of several runs on the machine that checked this book; they vary with load, the ratios much less. Doubling $N$ multiplies the linked time by about 7, close to the cubic 8, and the separate time by about 2. The linked Jacobian at $N = 40$ has 2,556 nonzeros, 0.6 % of its entries. One dense factorisation of it takes about 125 ms, and the rank and redundancy analysis after the solve (Chapters 12 and 14) about 350 ms. Both grow with the cube of the cluster size.

The second reason to split is that **errors stay local**. A conflict in one cluster cannot spoil the solution of another. The deletion filter of Chapter 14 also needs one trial solve per candidate constraint, so it searches only the conflicting cluster's constraints. In the sketch below, rectangle `b` is given a top of 36 mm while its width says 40. The compiler reports `sketch.overConstrained: no solution; minimal conflicting set: width(b) = 40 mm · length(b.top) = 36 mm`, with the fix `make dim(b.top) driven (it measures 40 mm)`. Rectangle `a`, in the other cluster, solves in 0 iterations. Both profiles, 600 and 800 mm², are still there.

```sketch
// title: A conflict stays in its cluster
// expect: sketch.overConstrained
// Read the diagnostic: it names only b's sizes. Then delete .dim('b.top', 36).
return j.sketch('two', { on: j.plane.XY })
  .rect('a', 30, 20)
  .rect('b', 40, 20, { at: [50, 0] })
  .dim('b.top', 36)
```

## 15.2 What jig does: connected components

jig builds a graph whose nodes are the unknowns. It joins two unknowns when they belong to the same entity or appear in the same equation. A **cluster** is a connected component of this graph. The code in `clustersOf` is a union–find:

```js
for (const i of unknowns) parent[i] = i
for (const e of entities) unite all unknown parameters of e
for (const c of activeConstraints)
  for (const eq of c.eqs) unite all of eq.vars
clusters = groups of unknowns with the same root, each with the
  constraints whose first variable lies in it
```

Union–find runs in almost linear time, so finding clusters costs nothing next to solving them. Each cluster gets its own solver run, decision record (`plate/cluster0 solver → dogleg …`) and rank analysis; the sketch's DOF is the sum over clusters.

Parameters fixed outright, such as every coordinate of an explicit sketch or of projected external geometry, are constants and not nodes; a constraint to `origin` or an axis links nothing. A `j.c.fix` is different: it adds equations, so a fixed point is still an unknown, and two entities that coincide with it share a cluster.

Figure 15.1 is a 60 × 30 mm plate whose two Ø6 holes have fixed centres. The L3 dump reads `3 clusters`: the rectangle helper's four lines and its centre point (18 unknowns), and each hole (3 unknowns). The total is $n = 24$, rank 24, status `fully`, and the decision list holds one solver run for each cluster.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('plate', { on: j.plane.XY })
  .rect('r', 60, 30)
  .circle('h1', 3, { at: [12, 15] })
  .circle('h2', 3, { at: [48, 15] })
  .constrain(j.c.fix('h1.center'), j.c.fix('h2.center'))
  .dim('h1', 6).dim('h2', 6)
```

**Figure 15.1.** Three clusters: the plate outline and two holes fixed where they are drawn. Nothing links them, so each is solved, analysed and dragged on its own. Profile r∖{h1, h2}, 1,743.45 mm².

Place the holes from the plate's corner instead, `h1` 12 mm right of and 15 mm above `r.bl` and `h2` level with it 36 mm further, and the dump becomes `1 cluster` with the same $n = 24$ and rank 24. One constraint that mentions both groups merges them. That is usually what you want, since the holes then follow the plate, but a slip in a hole dimension now involves the plate in its diagnosis.

```sketch
// title: One constraint merges clusters
// The dump shows 1 cluster. Replace the three distances by fixes: 3 clusters.
return j.sketch('plate', { on: j.plane.XY })
  .rect('r', 60, 30)
  .circle('h1', 3, { at: [12, 15] })
  .circle('h2', 3, { at: [48, 15] })
  .constrain(j.c.equal('h1', 'h2'),
    j.c.horizontal('h1.center', 'h2.center'),
    j.c.distanceX('r.bl', 'h1.center', 12),
    j.c.distanceY('r.bl', 'h1.center', 15),
    j.c.distanceX('h1.center', 'h2.center', 36))
  .dim('h1', 6)
```

Inside a cluster jig does nothing further. It substitutes nothing away (Chapter 3's closed polyline keeps 24 unknowns and 12 coincidence equations, where merging coincident points would leave 12 unknowns), stores the Jacobian dense, and does not order the work. The next section shows what that leaves on the table.

## 15.3 Finer decompositions

### Matching and the Dulmage–Mendelsohn decomposition

Draw the system as a **bipartite graph**: equations on one side, unknowns on the other, and an edge where an unknown appears in an equation. A **matching** pairs equations with unknowns along edges, each used at most once. Read a matched pair as "this equation determines that unknown". The size of a maximum matching is the **structural rank**: the rank the Jacobian has for generic values of its nonzero entries. Hopcroft and Karp find a maximum matching in $O(E \sqrt{V})$ time.

Dulmage and Mendelsohn showed that all maximum matchings share a canonical structure. Its coarse form has three parts. The **over-determined** part holds the equations reachable from an unmatched equation by alternating paths (any edge to an unknown, the matched edge back) and the unknowns they reach; it has more equations than unknowns. The **under-determined** part is the same construction from unmatched unknowns, with more unknowns than equations. The **well-determined** rest is square, with a perfect matching.

The fine form splits the well-determined part further. Make a directed graph with one node per matched pair. Draw an arc from pair $a$ to pair $b$ when $a$'s equation uses the unknown that $b$ determines. Its strongly connected components (Tarjan's algorithm) are square blocks. In topological order they are the **block triangular form**: solve the first block, substitute, solve the next, and so on.

jig computes none of this. To see what it would give, a scratch script took jig's own equations for the triangle in Figure 15.2 and ran a matching and Tarjan's algorithm over them. The triangle has lines `a`, `b`, `c` joined end to end, a fixed start, `a` horizontal, and sides of 40, 35 and 25 mm. jig solves it as one cluster: 12 unknowns, 12 equations, rank 12, converged in 4 iterations. The decomposition gives nine blocks:

| block | equations | unknowns |
|--:|---|---|
| 1, 2 | `fix(a.start)` x, y | `a.ax`, `a.ay` |
| 3 | `horizontal(a)` | `a.by` |
| 4 | `dim(a)` | `a.bx` |
| 5–8 | the two coincidences at `a.end` and `a.start`, x and y | `b.ax`, `b.ay`, `c.bx`, `c.by` |
| 9 | `dim(b)`, `dim(c)`, `coincident(c.start, b.end)` x, y | `b.bx`, `b.by`, `c.ax`, `c.ay` |

Eight blocks are single equations solvable by substitution; only the apex needs a 4 × 4 Newton solve. The table uses the generic pattern, read from the Jacobian at a randomly perturbed point. jig's own variable lists are coarser (each coordinate equation of a point lists both coordinates) and give five blocks, of sizes 2, 2, 2, 2 and 4.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('tri', { on: j.plane.XY })
  .line('a', [0, 0], [40, 0])
  .line('b', 'a.end', [10, 25])
  .line('c', 'b.end', 'a.start')
  .constrain(j.c.fix('a.start'), j.c.horizontal('a'))
  .dim('a', 40).dim('b', 35).dim('c', 25)
```

**Figure 15.2.** A triangle with sides 40, 35 and 25 mm: one cluster of 12 unknowns for jig, nine blocks in block triangular form. The apex solves to (12.5, 21.6506), where circles of radius 25 about (0, 0) and 35 about (40, 0) meet above the base.

The under-determined part locates freedom. For Chapter 3's outline with 3 DOF, the decomposition puts 9 equations and 12 unknowns in the under-determined part. Those unknowns are the y-coordinates of the foot, the upright and the top, and the x-coordinates of the upright. jig's warning names the same coordinates: `free: p.2 (1: end.y), p.3 (2: end, start.y), p.4 (3: start, end), p.5 (2: start, end.y), p.6 (1: start.y)`.

The decomposition is **structural**: it sees which unknowns appear in which equations and nothing about values. That makes it fast, and it also limits what it can see.

- It cannot tell redundant from conflicting. Add `parallel(p.1, p.3)` to the fully constrained outline, or give `p.3` a conflicting 50 mm length. Both have the same pattern, and both get the same over-determined part of 23 equations in 22 unknowns. jig's numerical tests say "implied by horizontal×2; dropped" for the first and name six constraints for the second (Chapter 14).
- Structural rank is only an upper bound on numerical rank. Put the parallel into the 3-DOF outline in place of a dimension. The matching pairs it with an unknown, so the structural count is 22 and the DOF 2. jig's rank is 21, the DOF 3, and it reports the parallel as redundant. Special positions break structural counts just as they break Maxwell's count (Chapter 12).

### Graph-constructive solvers

A **graph-constructive** solver, as in Owen (1991) and Fudos and Hoffmann (1997), works on the geometry instead: nodes are geometric elements, edges are constraints, and a **rigid cluster** is a set of elements whose relative positions are fixed. Starting from pairs, it merges three clusters that pairwise share an element, since three rigid bodies joined at three points form a rigid triangle. Each merge is a ruler-and-compass construction: intersect two circles, or a line and a circle.

For Figure 15.2 the plan is two steps. Place `a` from the fix, the horizontal and the length. Then construct the apex as the intersection of the circles of radius 25 about (0, 0) and 35 about (40, 0): $x = (25^2 - 35^2 + 40^2)/80 = 12.5$, $y = \sqrt{25^2 - 12.5^2} = 21.6506$. That is the point jig's Newton iteration reaches. The construction is exact and needs no starting guess. It does have two roots, $y = \pm 21.6506$, and the solver must choose one, usually by keeping the orientation of the drawing. A chain of $k$ such steps has up to $2^k$ solutions.

The limits are just as definite. Only well-constrained systems that decompose into such triangles (or the larger patterns a given solver knows) are constructible. Hoffmann, Lomonosov and Sitharam (2001) generalise the idea to decomposition plans whose pieces may be any small rigid subsystem. Those pieces still need a numerical solve. An under-constrained sketch must first be completed with extra constraints, and a cyclic configuration that decomposes into no small rigid piece leaves one large simultaneous system.

jig takes the simplest point on this spectrum: connected components, then a DogLeg solve of each. It finds no blocks inside a cluster, builds no rigid clusters, substitutes nothing, and uses no sparse factorisation. Chapter 23 returns to them.

## 15.4 Dragging as least change

A drag asks for three things at once, in order of priority. The constraints must hold. The dragged point should reach the pointer, or come as close as the constraints allow. Of all the configurations that do both, the sketch should take the one nearest to where it was. Written as an optimisation, from the current solution $x_0$:

$$
\min \lVert x - x_0 \rVert \quad \text{over the } x \text{ with } g(x) = 0 \text{ that minimise } \lVert p(x) - t \rVert ,
$$

where $p(x)$ is the dragged point and $t$ the pointer. The constraints are hard. The target is **soft**, in the sense that it is a least-squares objective and not an equation. Least change decides everything the first two leave open.

jig's `dragCluster` takes linearised steps toward this. At the current $x$ it computes the Jacobian $J$ of the cluster's equations, the minimum-norm Gauss–Newton step $h_0$ that restores them (zero when they already hold), and an orthonormal basis $N$ of the null space of $J$ from the same QR factorisation of $J^T$. Moving along $N z$ keeps the constraints to first order. With $D$ the 2 × $n$ Jacobian of the dragged point and $e = p(x) - t$, it solves for $z$ in

$$
\min \lVert D(h_0 + N z) + e \rVert ,
$$

taking the smallest $z$ when several are equally good. It then steps by $h = h_0 + N z$. Since $N$ is orthonormal, the smallest $z$ is the smallest step. The step is capped at $\max(5\ \mathrm{mm}, 2 \lVert e \rVert)$. The loop runs until the step is negligible or 40 iterations have passed, and a DogLeg solve of up to 50 iterations then cleans up the constraints.

Only the dragged point's cluster is re-solved. Each drag starts from the previous drag's result, which the worker keeps, so pointer moves are a chain of warm starts. A drag never feeds a compile: the next Run solves from the script.

### A drag worked by hand

Take a rectangle drawn as a closed polyline: horizontal and vertical sides, a bottom 40 mm long, nothing fixed. It has 16 unknowns and rank 13, so 3 DOF: slide in x, slide in y, and change the height. Drag the top-right corner from (40, 20) to (46, 26).

The x-motion has one source. The width is fixed, so all 8 x-coordinates shift by 6. For y, let the height grow by $a$ and the whole rectangle rise by $b$, with $a + b = 6$. The 4 y-coordinates of the top move by $a + b$ and the 4 of the bottom by $b$, so

$$
\lVert h \rVert^2 = 8 \cdot 6^2 + 4(a + b)^2 + 4b^2 ,
$$

which is smallest at $b = 0$. The least change keeps the bottom where it is and grows the rectangle, with $\lVert h \rVert = \sqrt{432} = 20.78$. Lifting the whole rectangle instead would cost $\sqrt{576} = 24$.

The measured drag agrees: the rectangle moves right by 6 mm, its top rises to y = 26, its bottom stays at y = 0 (to $10^{-15}$ mm), and the change has norm 20.784610, $\sqrt{432}$ to every digit printed. It takes 2 iterations, because the first step is capped at $2 \lVert e \rVert = 16.97$ mm. Dragging the top-left corner to (−5, 25) slides the rectangle left by 5 and grows it to 25 mm.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('r', { on: j.plane.XY })
  .polyline('p', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })
  .constrain(j.c.horizontal('p.1'), j.c.vertical('p.2'),
    j.c.horizontal('p.3'), j.c.vertical('p.4'))
  .dim('p.1', 40)
```

**Figure 15.3.** A rectangle with 3 DOF: its width is the only size. Dragging a top corner moves the rectangle sideways and changes its height. The far edge stays put, because that is the smallest change of coordinates that reaches the pointer.

### What does not move

A coordinate can move in a drag only if it has a component in the null space of $J$. That component is the diagonal of the projector $I - Q Q^T$, which jig also uses to draw free points in blue. A fixed point, or any point of a fully constrained cluster, has none. Measured:

- Dragging the apex of the triangle of Figure 15.2 changes nothing: 0 iterations, an empty moved list.
- In an explicit sketch every coordinate is a constant, so no cluster contains the point. The drag returns at once with the note `p.2.end is fixed`.
- Give Figure 15.1's plate a free height (`.rect('r', 60, null)`, drawn 10 mm tall) and drag `r.tr` to (60, 40). Only cluster 0 is re-solved: moved `r.right, r.top, r.left, r.center`; fixed `r.bottom, h1, h2`. The profiles change from three regions (600, 28.27, 28.27 mm²: the holes lay outside the plate) to one plate with two holes, 2,343.45 mm²; Chapter 16 explains why.

### Unreachable targets and branches

A two-link arm shows the soft target and the role of branches. It has a fixed base at the origin, links of 30 and 20 mm, and is drawn with its elbow at (18, 24) and its tip at (38, 24). That gives 8 unknowns, rank 6, and 2 DOF, the two joint angles. The elbow turns through −53.1°.

Drag the tip to (10, 40). The elbow can be where a circle of radius 30 about the base meets one of radius 20 about the target: (−6.8397, 29.2099) or (19.7808, 22.5548). The second is only 2.29 mm from the old elbow, yet the drag chooses the first, 25.4 mm away, with the elbow at −70.5°; twenty small moves give the same answer. The near solution lies on the other side of the line from base to tip, and no continuous motion reaches it without stretching the arm straight. Least change applies to each linearised step, so it keeps the elbow on its branch.

Now drag the tip to (60, 30), 67.08 mm from the base. The least-squares answer is the straight arm pointing at the target, tip at (44.72, 22.36), 17.082 mm short. jig stops at its 40-iteration limit with a bend of 0.37° and the tip 17.085 mm away; arriving in 20 small moves, at 2.26° and 17.160 mm. At full stretch the tip's Jacobian loses rank: bending the elbow moves the tip sideways to first order and toward the base only to second order, and a Gauss–Newton step sees first-order terms only.

The straight configuration is where the two branches meet. After it the measured elbow turns the other way, through +0.37° or +2.26° where it started at −53°. Drag the tip back to (30, 30) and the elbow comes to (28.2573, 10.0761), not (10.0761, 28.2573): the arm returns as its own mirror image. This is a general property of drags through singular configurations, not a fault of this example. To keep a branch, constrain it, for example with an angle at the elbow, or keep the drag short of full stretch.

```figure
// view: plan
// overlays: dims,dof
return j.sketch('arm', { on: j.plane.XY })
  .line('l1', [0, 0], [18, 24])
  .line('l2', 'l1.end', [38, 24])
  .constrain(j.c.fix('l1.start'))
  .dim('l1', 30).dim('l2', 20)
```

**Figure 15.4.** A two-link arm with 2 DOF. Within reach a drag keeps the elbow on its side of the base–tip line. Past reach the arm straightens toward the pointer, and coming back it may take the mirrored branch.

```sketch
// title: Drag the arm past its reach
// Drag the tip far out and back: the elbow comes back mirrored.
return j.sketch('arm', { on: j.plane.XY })
  .line('l1', [0, 0], [18, 24])
  .line('l2', 'l1.end', [38, 24])
  .constrain(j.c.fix('l1.start'))
  .dim('l1', 30).dim('l2', 20)
```

> **Try it.** Open the arm sketch in the workbench. The base is fixed and both links are blue, because both can turn. Drag the tip slowly in a circle around the base; the elbow keeps its side. Then drag it well past 50 mm and back in, and watch the elbow flip. Finally [load A-03](lab:preset/A-03) and drag hole `h2` along the plate: its x position is its only freedom, so the drag slides it and the plate does not move.

### A numerical note

With $M = D N$ and $G = M M^T$, the minimum-norm $z$ is $M^T G^{+} r$, where $r$ is the right-hand side and $G^{+}$ the pseudo-inverse. $G$ is 2 × 2, so jig computes $G^{+}$ exactly: the inverse at rank 2, $G / \operatorname{tr}(G)^2$ at rank 1, nothing at rank 0, where the target cannot move the point. An earlier version solved $(M^T M + \mu I) z = M^T r$ with a tiny $\mu$; that $k \times k$ matrix has rank at most 2, so its condition number reached about $10^{11}$ and rounding moved undetermined coordinates by about 0.0001 mm. The lesson is general: solve a short, wide least-squares problem through its small Gram matrix $M M^T$ or a QR factorisation, never through $M^T M$. Now the rectangle's bottom stays at $10^{-15}$ mm, Chapter 3's foot at 8 mm, and a drag on the arm's fixed base moves nothing: 0 iterations, an empty moved list.

## 15.5 Key points

- Splitting pays twice: dense solving costs the cube of the cluster size (40 linked rectangles about 650 ms, 40 separate about 14 ms), and a conflict is found inside its own cluster.
- jig's clusters are the connected components of the graph of unknowns, joined by entities and equations. Constants link nothing, and a `j.c.fix` is equations, so a fixed point is still an unknown.
- Inside a cluster jig solves everything at once: no substitution, no sparse factorisation, no block ordering.
- Bipartite matching and the Dulmage–Mendelsohn decomposition split a system into over-, under- and well-determined parts and order the well-determined part into square blocks. The triangle's 12 unknowns become nine blocks, eight of them single equations.
- Structural methods see patterns, not values. They cannot tell redundant from conflicting, and structural rank can exceed numerical rank.
- Graph-constructive solvers build rigid clusters by ruler-and-compass steps: exact and guess-free, but only for decomposable, well-constrained systems, with two roots per step.
- A drag keeps constraints hard, treats the pointer as a least-squares target, and takes the least change of coordinates. Only the dragged point's cluster moves, starting from the last drag.
- Least change is local: a drag keeps a branch, except through a singular configuration such as a fully stretched arm.

## Exercises

> **Exercise.** Predict the clusters of a sketch with a rectangle, a circle concentric with a point that coincides with the rectangle's centre, and a second circle with a fixed centre. Write it and compare with the L3 dump in the [IR view](lab:show/ir).

> **Exercise.** For the free rectangle of Figure 15.3, work out by hand where a drag of the bottom-left corner to (−4, −6) puts every side, and the norm of the change. Open the sketch in the workbench, drag, and compare.

> **Exercise.** The fully constrained outline of Chapter 3 (its Figure 3.3, without the driven dimension) has 24 unknowns and 24 equations. Find by hand an order in which each equation fixes one new unknown, so that the block triangular form is 24 blocks of size 1. What does that say about solving it by substitution, compared with jig's one 24-unknown cluster?

> **Exercise.** Add `j.c.angle('l1', 'l2', deg(60))` to the arm. How many DOF remain, and what does a drag of the tip do now? Check in the workbench whether the elbow can still flip.

## Further reading

- Dulmage and Mendelsohn, *Coverings of bipartite graphs*, Canadian Journal of Mathematics 10, 1958: the canonical decomposition of a bipartite graph into over-, under- and well-determined parts.
- Pothen and Fan, *Computing the block triangular form of a sparse matrix*, ACM Transactions on Mathematical Software 16(4), 1990: matching plus strongly connected components, as an algorithm with its costs.
- Fudos and Hoffmann, *A graph-constructive approach to solving systems of geometric constraints*, ACM Transactions on Graphics 16(2), 1997: rigid clusters merged by triangle constructions, and how the solver chooses roots.
- Hoffmann, Lomonosov and Sitharam, *Decomposition plans for geometric constraint systems*, Journal of Symbolic Computation 31, 2001: decompositions into small rigid subsystems, and measures for comparing them.
- Nocedal and Wright, *Numerical Optimization*, Springer, 2nd ed. 2006: least-squares problems, null-space methods for equality constraints, and why normal equations lose accuracy.
- [How sketches are solved](lab:doc/solver): clusters, solver choice and dragging as a reference page.
