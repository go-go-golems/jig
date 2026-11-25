#!/usr/bin/env python3
"""Render a Jig Stage job ZIP on an OptiX host (Python, Pillow, NumPy and ffmpeg)."""
import argparse
import hashlib
import itertools
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

import numpy as np
from PIL import Image


def rgb(path):
    with Image.open(path) as image:
        return np.asarray(image.convert('RGB'), dtype=np.int32)


def render(package, work, args):
    with zipfile.ZipFile(package) as archive:
        for name in archive.namelist():
            if Path(name).is_absolute() or '..' in Path(name).parts:
                raise ValueError(f'Unsafe path {name!r}')
        archive.extractall(work)
    job = json.loads((work / 'job.json').read_text())
    frames = job['frames']
    if job['format'] != 'jig-stage-job/1' or not frames or [r['sourceFrame'] for r in frames] != list(range(job['first'], job['last'] + 1)):
        raise ValueError('Invalid native frame range')
    first = job['first']
    ev = job['ev']
    spp = args.spp if args.spp is not None else job['spp']
    if not isinstance(spp, int) or spp < 1:
        raise ValueError('SPP must be a positive integer')
    receipts = []
    for panel in range(max(len(r['views']) for r in frames)):
        def signature(row):
            if panel >= len(row['views']):
                return None
            v = row['views'][panel]
            return v['scene'], v['width'], v['height']

        for group, rows in itertools.groupby(frames, signature):
            rows = list(rows)
            if group is None:
                continue
            scene, width, height = group
            if not scene.startswith('scene-') or not scene[6:].isdigit():
                raise ValueError(f'Invalid scene directory {scene}')
            tracks = [dict(time=r['time'], view=r['views'][panel]['view'], poses=r['views'][panel]['poses']) for r in rows]
            start = rows[0]['sourceFrame']
            track = work / 'track.json'
            track.write_text(json.dumps(tracks))
            label = 'panel-' + str(panel)
            command = [str(args.rt), 'render', 'Jig-Stage', '--bundle', str(args.bundle),
                       '--kernels', str(args.kernels), '--scene-files', str(work / scene), '--frame-track', str(track),
                       '--frames', str(len(rows)), '--first-frame', str(start), '--seed', str(1 + start),
                       '--fps', str(job['fps']), '--size', f'{width}x{height}', '--spp', str(spp),
                       '--no-motion-blur', '--backend', 'optix', '--format', 'png', '--denoise', 'scene',
                       '--name', label, '--out', str(work)]
            if ev is not None:
                command.extend(['--ev', str(ev)])
            subprocess.run(command, check=True)
            report = json.loads((work / (label + '.json')).read_text())
            if (report['backend'], report['spp'], report['frames'], report['width'], report['height']) != ('optix', spp, len(rows), width, height):
                raise ValueError('Unexpected native receipt')
            ev = report['ev']
            receipts.append(dict(first=start, last=rows[-1]['sourceFrame'], panel=panel, backend='optix',
                                 ev=ev, spp=spp, renderMs=report['renderMs']))
    for row in frames:
        i = row['sourceFrame']
        base = rgb(work / 'plates' / f'{i}-black.png')
        output = base.copy()
        for panel, view in enumerate(row['views']):
            x, y = view['origin']
            area = np.s_[y:y + view['height'], x:x + view['width']]
            weight = rgb(work / 'plates' / f'{i}-{panel}.png')[area] - base[area]
            beauty = rgb(work / f'panel-{panel}.{i:04}.png')
            output[area] += (weight * beauty + 127) // 255
        result = Image.fromarray(output.clip(0, 255).astype('uint8'))
        result.save(work / f'output-{i - first:06}.png')
    dest = args.output
    dest.mkdir(exist_ok=True, parents=True)
    result = 'frame.png' if len(frames) == 1 else 'movie.mp4'
    if len(frames) == 1:
        (work / 'output-000000.png').rename(work / result)
    else:
        subprocess.run(['ffmpeg', '-v', 'error', '-framerate', str(job['fps']), '-i', str(work / 'output-%06d.png'),
                        '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                        str(work / result)], check=True)
    receipt = dict(format=job['format'], first=first, last=job['last'], frames=len(frames), fps=job['fps'],
                   width=job['width'], height=job['height'], spp=spp, native=receipts, output=result,
                   sha256=hashlib.sha256((work / result).read_bytes()).hexdigest())
    (work / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    for name in (result, 'receipt.json'):
        os.replace(work / name, dest / name)
    print(json.dumps(receipt))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('zip', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--rt', type=Path, required=True)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--kernels', type=Path, required=True)
    parser.add_argument('--spp', type=int)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output) as tmp:
        render(args.zip, Path(tmp), args)


if __name__ == '__main__':
    main()
