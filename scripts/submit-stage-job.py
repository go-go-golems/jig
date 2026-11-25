#!/usr/bin/env python3
"""Submit a Stage job to an SSH-accessible OptiX host and fetch its verified result."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path, help='ZIP from Render CAD Stage → Export Spark job')
    parser.add_argument('output', type=Path, help='New local directory for the movie or still and receipt')
    parser.add_argument('--host', required=True, help='SSH hostname, optionally user@host')
    parser.add_argument('--rt', required=True, help='Absolute native renderer path on the host')
    parser.add_argument('--bundle', required=True, help='Absolute Candela bundle path on the host')
    parser.add_argument('--kernels', required=True, help='Absolute renderer kernels directory on the host')
    parser.add_argument('--spp', type=int, help='Override the packaged sample count')
    args = parser.parse_args()
    if not re.fullmatch(r'[\w.][\w.@-]*', args.host):
        parser.error('Expected an SSH hostname or user@host')
    if not all(PurePosixPath(p).is_absolute() for p in (args.rt, args.bundle, args.kernels)):
        parser.error('Use absolute paths for the three remote renderer inputs')
    if args.spp is not None and args.spp < 1:
        parser.error('Samples per pixel must be positive')
    if not args.package.is_file() or args.output.exists():
        parser.error('Choose an existing job ZIP and a new output directory')
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def ssh(argv):
        return subprocess.check_output(['ssh', '-o', 'BatchMode=yes', args.host, shlex.join(argv)], text=True).strip()

    def transfer(*paths):
        subprocess.run(['scp', '-o', 'BatchMode=yes', '--', *map(str, paths)], check=True)

    work = ssh(['mktemp', '-d', '/tmp/jig-stage-XXXXXXXX'])
    if not re.fullmatch(r'/tmp/jig-stage-[a-zA-Z0-9]+', work):
        raise RuntimeError('Unexpected remote job directory: ' + work)
    session = PurePosixPath(work).name
    remote = args.host + ':' + work
    print('Remote job:', remote, ' tmux:', session, flush=True)
    runner = Path(__file__).with_name('render-stage-job.py')
    transfer(args.package.resolve(), remote + '/job.zip')
    transfer(runner.resolve(), remote + '/render-stage-job.py')
    render = ['python3', 'render-stage-job.py', 'job.zip', 'result', '--rt', args.rt,
              '--bundle', args.bundle, '--kernels', args.kernels]
    if args.spp is not None:
        render.extend(['--spp', str(args.spp)])
    # Publish the exit status only after the runner closes its receipt.
    command = shlex.join(render) + ' >render.log 2>&1; echo $? >status.tmp; mv status.tmp status'
    ssh(['tmux', 'new-session', '-d', '-s', session, '-c', work, command])
    while True:
        status = ssh(['sh', '-c', 'cd "$1" && if test -f status; then cat status; elif tmux has-session -t "$2" 2>/dev/null; then echo running; else echo interrupted; fi',
                      'monitor', work, session])
        if status != 'running':
            break
        time.sleep(5)
    if status != '0':
        raise RuntimeError('Remote job failed: ' + ssh(['tail', '-30', work + '/render.log']))

    with tempfile.TemporaryDirectory(dir=args.output.parent) as tmp:
        staged = Path(tmp) / 'result'
        staged.mkdir()
        transfer(remote + '/result/receipt.json', staged)
        receipt = json.loads((staged / 'receipt.json').read_text())
        name = receipt['output']
        if name not in ('movie.mp4', 'frame.png'):
            raise ValueError('Unexpected remote output name')
        transfer(remote + '/result/' + name, staged)
        if hashlib.sha256((staged / name).read_bytes()).hexdigest() != receipt['sha256']:
            raise ValueError('Downloaded result does not match its receipt')
        os.rename(staged, args.output)
    print('Verified', args.output / name)


if __name__ == '__main__':
    main()
