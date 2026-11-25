// RGB codes are allocated once from the complete source assembly. Isolation
// and clipped geometry retain the original occurrence IDs in body.part.
export function componentPalette(program) {
  const ids = new Set((program?.assembly?.components ?? []).map(component => component.id));
  for (const body of program?.bodies ?? []) ids.add(body.part ?? body.id);
  if (ids.size > 0xffffff) throw Error('Component mask exceeds the 24-bit RGB palette');
  const colors = new Map();
  for (const id of [...ids].sort()) {
    // Odd multiplication permutes the 24-bit space and separates adjacent
    // entries visually while keeping 0 reserved for the background.
    colors.set(id, Math.imul(colors.size + 1, 0x9e3779) & 0xffffff);
  }
  return colors;
}

export function componentLegend(palette) {
  return { background: '#000000', components: Array.from(palette, ([id, rgb]) => ({
    id, color: '#' + rgb.toString(16).padStart(6, '0'),
  })) };
}

export function paintComponentMask(ctx, scene, buf, palette) {
  const colors = scene.instances.map(({ body }) => {
    const id = body.part ?? body.id;
    if (!palette.has(id)) throw Error('Missing component mask color for ' + id);
    return palette.get(id);
  });
  const image = ctx.createImageData(buf.w, buf.h);
  const faceId = buf.id;
  for (let i = 0, j = 0; i < faceId.length; i++, j += 4) {
    const color = faceId[i] < 0 ? 0 : colors[scene.faceInst[faceId[i]]];
    image.data[j] = color >>> 16;
    image.data[j + 1] = (color >>> 8) & 255;
    image.data[j + 2] = color & 255;
    image.data[j + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}
