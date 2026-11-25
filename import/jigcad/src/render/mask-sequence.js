// Lossless occurrence mattes for compositing, sampled on the ordinary Stage output clock.
import { componentLegend } from '../stage/component-mask.js';
import { loadCandela } from './host.js';
import { isWorkArea, outputFrames, outputRow, STAGE_FPS } from './work-area.js';

export async function maskSequence({study, first, last, palette, renderFrame, signal, onProgress}) {
  if (!isWorkArea(first, last, outputFrames(study))) throw Error('Invalid mask frame interval');
  if (last - first + 2 > 65535) throw Error('Use a shorter interval for the PNG sequence ZIP');
  const { zipStore } = await loadCandela();
  const canvas = document.createElement('canvas');
  const entries = [];
  for (let frame = first; frame <= last; frame++) {
    signal.throwIfAborted();
    const sample = outputRow(study, frame);
    await renderFrame(canvas, sample, signal);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('Could not encode mask frame ' + frame);
    entries.push({ name: 'frames/' + String(frame).padStart(6, '0') + '.png', data: new Uint8Array(await blob.arrayBuffer()) });
    onProgress(Math.round(100 * (frame - first + 1) / (last - first + 1)));
  }
  signal.throwIfAborted();
  const legend = { ...componentLegend(palette), fps: STAGE_FPS, first, last, width: canvas.width, height: canvas.height };
  entries.push({ name: 'legend.json', data: new TextEncoder().encode(JSON.stringify(legend, null, 2) + '\n') });
  return zipStore(entries);
}
