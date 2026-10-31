# Overlays

Overlays are what the stage adds to the drawing to explain it. Each one is a named switch, has one hue, and draws only while it is on. The drawing itself stays ink.

## The switches

The **Show ▾** menu in the stage toolbar lists them (stage.jsx:10-14); the Order menu adds the two depth-order tools. On by default: Shadows, Trail, Dims, Grid (host.js:34).

| switch | key | what it draws | hue | marks | source |
|---|---|---|---|---|---|
| Shadows | `shadows` | hatched sun shadows of every solid loft | `st-shadow` | hatch, 0.6 px | draft.js |
| Trail | `trail` | the last jump: ghost decks, the centre's and the nose's paths | `st-ghost`, `st-blue`, `st-teal` | 0.8 px ghosts; 1.2 px path, 1.6 px ticks every 50 ms; 0.8 px dashed `3 3` nose path | board.js |
| Dims | `annotations` | a floor dimension from take-off to landing for the last four tricks | `st-blue`, bails `st-rec` | dimension line, fading with age | recognizer.js |
| Grid | `grid` | the floor grid, 0.5 m and 2 m | `st-grid`, `st-major` | 0.6 px | terrain.js |
| Forces | `forces` | the leg force as an arrow up from the hips, 1 m per 2,500 N, with its value; each engaged foot guide as a dashed line to the point of the deck it pulls | `st-amber` | 1 px arrow; 8 px label; dash `3 2`, 2 px end dot | figure.js, motors.js |
| Contacts | `contacts` | every active contact of the deck as a dot, and its force along the ground normal, 1 m per 1,200 N | `st-rec` | 2.6 px dot, 1 px arrow | board.js |
| Rig | `rig` | the skeleton's sticks and joints; the centre of mass | `st-violet`; `st-rec` | 1 px sticks, 2.2 px hollow joints; 3.5 px dot and `COM` | figure.js |
| Sites | `sites` | the deck's named sites | `st-green` | 12 mm ring, 8 px name | board.js |
| Course | `course` | the autopilot's waypoints and where it is heading | `st-blue` | dashed `2 4` legs at 0.7, 0.12 m rings; dashed `1 3` line to a 3 px target dot | controls.js |
| Order changes | `changes` | parts whose drawing order just flipped | `st-rec` | 2.4 px outline, fading over 18 frames | draft.js |
| Truth | `truth` | the cells the drawing order gets wrong | `st-rec` | 3 px cells at 0.5 | draft.js, truth.js |

## Marks

```js
g.line(a, b, { tone, width, alpha, dash })      // world points; 1 px by default
g.polyline(points, { tone, width, alpha, dash, closed })
g.arrow(p, v, { tone, width })                   // from p along the world vector v; head min(7 px, half the length), 0.45 as wide
g.dot(p, px, { tone, hollow, normal })           // radius in px; hollow = paper inside; hidden when normal faces away
g.ring(p, metres, { tone })                      // a horizontal circle; a 3 px circle when under 6 px across
g.label(text, p, { tone, size, dx, dy, align, bg })
```

A `tone` is a palette name (`ink`, `muted`, `accent` or `red` for `st-rec`, `warn`, `soft`, `blue`, `green`, `violet`, `amber`, `teal`, `ghost`) or a CSS colour. Prefer names: they follow the theme.

## Rules for a new overlay

- Gate it: `if (!g.on('<name>')) return;` at the top of the view, so it costs nothing when off.
- Draw it on the `overlay` layer (over the solids) unless it lies on the ground (`floor`, under them, as the course and the dimensions do) or is a past state (`ghost`).
- Take one hue from the table by meaning. Forces are amber, contacts and failures `st-rec`, kinematics violet, positions and paths blue, names of places green. A view that needs a second series uses `st-teal`.
- Draw vectors to a stated scale in metres per unit and write the scale into the label or the caption. Scales differ between overlays (Forces 1 m per 2,500 N, Contacts 1 m per 1,200 N), so arrows from two overlays cannot be compared by eye.
- An arrow is a projected world vector: it is foreshortened like any line, true length only parallel to the sheet. Look along the vector's plane to read it.
- Impulses and angular nudges have no lasting force or point; no overlay draws them.
