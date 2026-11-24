#!/usr/bin/python3
"""Sample gear clearance from the current Jig part builders.

From the repository root on Debian with Node 24 and python3-shapely installed:
  /usr/bin/python3 ttmp/2026/11/23/COMPUR-002*/scripts/check-cocking-mesh.py

The check applies opposite rotations about the named pivot ports and compares
the complete XY profiles of the two toothed extrusions. Positive area indicates
interference. It excludes the axial lug and knob and only tests sampled angles.
"""
import json
import math
import statistics
import subprocess
from pathlib import Path

from shapely.affinity import rotate
from shapely.geometry import Point, Polygon

# Evaluate the same Jig builders used by the workbench. Select features by ID
# so adding a preceding extrusion cannot accidentally change this measurement.
READ_FACTORIES = """
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
register('./test/engine/loader.mjs', import.meta.url)
const { makeJ } = await import('./src/engine/j.js')
const { frameOf } = await import('./src/engine/adapt.js')
const { j, bare } = makeJ()
const source = readFileSync(
  'content/presets/M-11-synchro-compur/compur.parts.js', 'utf8')
const factory = Function('j', 'mm', source)(j, bare.mm)
function profile(name, feature) {
  const part = factory[name]()
  const [region, height] = part.items.find(item => item.id === feature).args
  const { origin, z } = part.meta.ports.find(port => port.name === 'pivot').frame
  if (z.z !== 1) throw Error('Expected an axis parallel to +Z')
  const frame = frameOf(region.plane)
  if (frame.x[0] !== 1 || frame.y[1] !== 1 || frame.origin.slice(0,2).some(Boolean))
    throw Error('Expected an XY profile offset only in Z')
  return { spec: region.spec, pivot: [origin.x, origin.y],
           z: [frame.origin[2], frame.origin[2] + height.value] }
}
console.log(JSON.stringify([profile('cockingRing','ring'), profile('pinion','teeth')]))
"""


def geometry(spec, polygons):
    """Evaluate the feature's profile tree, retaining its polygon primitives."""
    op = spec['op']
    if op == 'polygon':
        polygons.append(spec['pts'])
        return Polygon(spec['pts'])
    if op == 'circle':
        centre = spec.get('opts', {}).get('at', [0, 0])
        return Point(centre).buffer(spec['r'], resolution=256)
    a = geometry(spec['a'], polygons)
    b = geometry(spec['b'], polygons)
    if op == 'union':
        return a.union(b)
    if op == 'subtract':
        return a.difference(b)
    raise ValueError(f'Unsupported region operation {op}')


def tooth_pitch(outline, pivot):
    # Each involute tooth has two addendum vertices at the maximum radius.
    # Two consecutive tip pairs give the angular spacing between teeth.
    polar = [(math.dist(point, pivot),
              math.atan2(point[1] - pivot[1], point[0] - pivot[0]))
             for point in outline]
    outer_radius = max(radius for radius, _ in polar)
    tips = sorted(angle for radius, angle in polar
                  if math.isclose(radius, outer_radius, abs_tol=1e-9))
    pitches = [b - a for a, b in zip(tips, tips[2:])]
    if len(pitches) < 3 or max(pitches) - min(pitches) > 1e-8:
        raise ValueError('Could not identify regularly spaced tooth tips')
    return statistics.median(pitches)


def main():
    repo = next(p for p in Path(__file__).resolve().parents
                if (p / 'import/jigcad/src/engine').is_dir())
    parts = json.loads(subprocess.check_output(
        ['node', '--input-type=module', '-e', READ_FACTORIES],
        cwd=repo / 'import/jigcad', text=True))
    if max(p['z'][0] for p in parts) >= min(p['z'][1] for p in parts):
        raise ValueError('Toothed extrusions do not share an axial interval')

    gears = []
    for part in parts:
        polygons = []
        shape = geometry(part['spec'], polygons)
        pitch = tooth_pitch(max(polygons, key=len), part['pivot'])
        gears.append((shape, tuple(part['pivot']), pitch))
    (ring, ring_axis, ring_pitch), (pinion, pinion_axis, pinion_pitch) = gears
    ratio = pinion_pitch / ring_pitch
    min_gap, max_area = math.inf, 0
    for i in range(-380, 381):
        angle = i / 20
        a = rotate(ring, angle, origin=ring_axis)
        b = rotate(pinion, -angle * ratio, origin=pinion_axis)
        min_gap = min(min_gap, a.distance(b))
        max_area = max(max_area, a.intersection(b).area)
    print(f'761 poses, ±19°, ring step 0.05°, pinion/ring ratio {ratio:.8f}')
    print(f'Minimum clearance {min_gap:.6f} mm, '
          f'maximum intersection {max_area:.9f} mm²')
    if min_gap <= 0:
        raise SystemExit('Contact or interference in sampled gear profiles')


if __name__ == '__main__':
    main()
