// S-06 · Keyring name tag: a flat tag with a ring hole and a raised name.
// Notice the width: an expression written from the name's length, so a
// longer name makes a longer tag and a change to `size` still follows.
const NAME = 'MAREN'   // the text: capitals read best at this size

const outline = j.sketch('outline', { on: j.plane.XY })
  .rect('tag', 'w', 'h', { center: true, r: 'h / 2 - 1 mm' })
  // a circle inside the outline is a hole in the profile: one extrude
  // makes the tag and its ring hole
  .circle('ring', 'ring_d / 2', { at: ['-w / 2 + h / 2', 0] })

const tag = j.part('name-tag')
  .params({
    size: mm(8),         // cap height of the letters
    t: mm(3),            // plate thickness: 15 layers, stiff on a key ring
    relief: layer(4),    // the letters stand 0.8 mm proud: 4 layers
    ring_d: mm(5),       // hole for a 25 mm split ring (1.2 mm wire)
    h: 'size + 10 mm',   // tag height: the letters with a 5 mm margin
    // a capital in this font is at most about its height wide; the tag
    // is the name, the round ring end and a 4 mm margin
    w: `${NAME.length} * size + h + 4 mm`,
  })
  .expose(['size', 't', 'relief'], {
    labels: { size: 'letter height', t: 'tag thickness',
      relief: 'letter height above the tag' },
    ranges: { size: [mm(5), mm(14)], t: [mm(2), mm(5)],
      relief: [mm(0.4), mm(2)] },
  })
  .extrude(outline.profiles(), 't', { id: 'plate' })
  // the name starts just right of the ring end
  .emboss(j.region.text(NAME, { size: 'size', align: 'left',
    at: ['-w / 2 + h - 1 mm', 0] }),
    'relief', { on: j.feat('plate').endFace(), id: 'letters' })

// Flat on the bed, letters up. For two colours, change filament at the
// top of the plate (3.0 mm): the letters print in the second colour.
return j.print('name-tag', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [tag],
}).orient('+Z')
