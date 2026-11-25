"""Run SG-09 native OptiX segments on the Spark, keeping a shared exposure."""
import argparse
import itertools
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', type=Path)
    parser.add_argument('--rt', type=Path, required=True)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--kernels', type=Path, required=True)
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--height', type=int, default=1080)
    parser.add_argument('--spp', type=int, default=64)
    parser.add_argument('--range', type=int, nargs=2, metavar=('FIRST', 'LAST'))
    parser.add_argument('--ev', type=float)
    args = parser.parse_args()
    job = args.job.resolve()
    track = job / 'frames.json'
    frames = json.loads(track.read_text())
    assert len(frames) == 312
    first, last = args.range or (0, len(frames) - 1)
    if not 0 <= first <= last < len(frames):
        parser.error('invalid inclusive frame range')
    out = job / 'beauty'
    stats_dir = job / 'stats'
    out.mkdir(exist_ok=True)
    stats_dir.mkdir(exist_ok=True)
    ev = args.ev
    for variant, group in itertools.groupby(range(first,last+1),
            key=lambda i: frames[i]['variant'] if frames[i]['surface'] > 0 else None):
        rows = list(group)
        if variant is None:
            continue
        start, end = rows[0], rows[-1]
        cmd = [str(args.rt.resolve()), 'render', 'SG-09',
               '--bundle', str(args.bundle.resolve()), '--kernels', str(args.kernels.resolve()),
               '--scene-files', str(job / variant), '--frame-track', str(track),
               '--sequence', '--start-frame', str(start), '--first-frame', str(start),
               '--frames', str(len(rows)), '--fps', '24', '--backend', 'optix',
               '--size', f'{args.width}x{args.height}', '--spp', str(args.spp),
               '--no-motion-blur', '--format', 'png', '--denoise', 'scene',
               '--out', str(out), '--name', 'beauty']
        if ev is not None:
            cmd.extend(['--ev', str(ev)])
        print(f'OptiX {variant} {start}..{end}: {len(rows)} beauty frames', flush=True)
        subprocess.run(cmd, check=True)
        receipt = json.loads((out / 'beauty.json').read_text())
        assert receipt['backend'] == 'optix' and receipt['frames'] == len(rows)
        assert (receipt['width'],receipt['height'],receipt['spp']) == (args.width,args.height,args.spp)
        assert all((out / f'beauty.{i:04}.png').stat().st_size for i in rows)
        if ev is None:
            ev = receipt['ev']
        receipt.update(first=start,last=end,variant=variant)
        (stats_dir / f'{start:04}-{end:04}.json').write_text(json.dumps(receipt,indent=2)+'\n')
        print(f'Exposure EV {ev:.6f}, render time {receipt["renderMs"]/1000:.1f}s', flush=True)


if __name__ == '__main__':
    main()
