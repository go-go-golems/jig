# Desk tray with compartments

A 160 × 100 × 30 mm desk tray with six compartments whose floors curve up into the walls, so paper clips and drawing pins slide out under a finger. The idea it teaches is building by removal: the tray is a solid block, one cut takes out every compartment at once, and the dividers are simply what the cut leaves behind.

> **Try it.** [Make it four compartments across](lab:param/nx=4), then [one deep](lab:param/ny=1), and [open the params](lab:show/params) to see `cw` and `cd` follow. [Select the rim](lab:select/body/end) and read its name in the inspector.

## How it is built

`body` is the outside: a rounded rectangle extruded to `h`. `pockets` is a sketch on the top face holding one rounded rectangle `c` and a grid pattern of it, `nx` by `ny`, stepped by the compartment size plus one wall. The compartment size is derived, not set:

```js
cw: '(w - (nx + 1) * wall) / nx',
cd: '(d - (ny + 1) * wall) / ny',
```

so `nx + 1` walls of 1.8 mm always fit, whatever the outside size. `pocket` cuts the whole grid down to the 1.6 mm floor in one feature.

`scoop` fillets the floor edges of every pocket. The selector asks for the concave edges of `pocket` at the floor height, `ctx.p.floor`, so it still finds them when the floor changes. The scoop radius equals the corner radius (6 mm): with equal radii the corners become quarter spheres, and the largest radius that works is the corner radius.

## Configurations

`configs` holds three layouts: `pens` (4 × 1, 80 mm deep), `mixed` (3 × 2) and `parts` (4 × 3, 25 mm tall). With none chosen the middle row, `mixed`, is active; a parameter you set on top of a config wins over it.

## Printing it

Upright on its floor: 81.4 cm³, about 101 g of PLA and 261 min. Walls of `lw(4)` and a floor of `layer(8)` are whole numbers of lines and layers, so the slicer has no thin gaps to fill. The bottom edge has a 0.5 mm chamfer for elephant's foot.

## Where next

- [D-09 Gridfinity baseplate](lab:preset/D-09): compartments that move, on a 42 mm grid.
- [D-08 Drawer divider set](lab:preset/D-08): dividers as separate parts that slot together.
