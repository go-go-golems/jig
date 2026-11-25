"""Compose the native beauty image through Stage's per-pixel opacity response.

The two calibration plates are the identical Stage frame drawn over black and
white synthetic beauty images. Every Canvas over operation is affine in that
underlying RGB value. Its output is B + (W - B) * beauty / 255. This preserves
edge antialiasing, sheet furniture, cap hatch, trajectory and label opacity.
"""
import argparse
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image


def rgb(file):
    with Image.open(file) as image:
        return np.asarray(image.convert('RGB'), dtype=np.int32)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--rows', help='Comma-separated frame numbers')
    parser.add_argument('--beauty-pattern', default='beauty/beauty.{row:04d}.png')
    args = parser.parse_args()
    out = args.out or args.job / 'composite'
    out.mkdir(parents=True, exist_ok=True)
    rows = {int(v) for v in args.rows.split(',')} if args.rows else None
    for frame in json.loads((args.job / 'frames.json').read_text()):
        row = frame['row']
        if rows is not None and row not in rows:
            continue
        name = f'{row:04d}.png'
        black = args.job / 'plates' / ('black-' + name)
        temp = out / (name + '.partial')
        if frame['surface']:
            b = rgb(black)
            w = rgb(args.job / 'plates' / ('white-' + name))
            p = rgb(args.job / args.beauty_pattern.format(row=row))
            if not b.shape == w.shape == p.shape:
                raise ValueError(f'At sample {row}: plate {b.shape}, white {w.shape}, beauty {p.shape}')
            image = np.clip(b + ((w - b) * p + 127) // 255, 0, 255).astype('uint8')
            Image.fromarray(image).save(temp, format='PNG', compress_level=2)
        else:
            temp.write_bytes(black.read_bytes())
        os.replace(temp, out / name)
        if row % 24 == 0 or row == 311:
            print(f'Composited frame {row}', flush=True)


if __name__ == '__main__':
    main()
