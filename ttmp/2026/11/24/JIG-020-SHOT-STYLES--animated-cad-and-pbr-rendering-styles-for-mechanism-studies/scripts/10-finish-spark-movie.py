"""Encode and verify a fully composited SG-09 sequence; keep a portable receipt."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('job', type=Path)
    p.add_argument('--checkout', type=Path, required=True)
    p.add_argument('--name', default='SG-09-optix-1080p')
    p.add_argument('--spp', type=int, default=64, help='Expected samples per pixel in every native segment')
    args = p.parse_args()
    job = args.job.resolve()
    frames = json.loads((job / 'frames.json').read_text())
    shaded = {i for i,f in enumerate(frames) if f['surface'] > 0}
    receipts = [json.loads(f.read_text()) for f in sorted((job/'stats').glob('*.json'))]
    covered = set()
    for r in receipts:
        assert (r['backend'], r['width'], r['height'], r['spp']) == ('optix',1920,1080,args.spp)
        covered.update(range(r['first'],r['last']+1))
    assert shaded == covered
    assert len(frames) == 312
    seq = job / 'composite'
    for i in range(len(frames)):
        with Image.open(seq / f'{i:04}.png') as im:
            assert im.size == (1920,1080)
    dest = job / (args.name + '.mp4')
    temp = dest.with_suffix('.partial.mp4')
    subprocess.run(['ffmpeg','-v','error','-y','-framerate','24','-start_number','0',
        '-i',str(seq/'%04d.png'),'-frames:v',str(len(frames)),'-an','-vf','scale=out_color_matrix=bt709',
        '-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p','-colorspace','bt709',
        '-color_primaries','bt709','-color_trc','iec61966-2-1','-movflags','+faststart',str(temp)],check=True)
    codec = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
        '-count_frames','-show_entries','stream=codec_name,width,height,avg_frame_rate,duration,nb_read_frames',
        '-of','json',str(temp)]))['streams'][0]
    assert (codec['codec_name'],codec['width'],codec['height'],codec['avg_frame_rate'],
            float(codec['duration']),int(codec['nb_read_frames'])) == ('h264',1920,1080,'24/1',13,312)
    refs = [0,36,84,204,264,311]
    expr = '+'.join(f'eq(n\\,{i})' for i in refs)
    pixels = subprocess.check_output(['ffmpeg','-v','error','-i',str(temp),'-vf',f'select={expr}',
        '-fps_mode','vfr','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
    decoded = np.frombuffer(pixels,np.uint8).reshape(len(refs),1080,1920,3)
    checks = []
    for i, frame in zip(refs,decoded):
        ref = np.asarray(Image.open(seq/f'{i:04}.png').convert('RGB'))
        mae = float(np.mean(np.abs(frame.astype(np.int16)-ref)))
        assert mae < 4, (i,mae)
        checks.append({'frame':i,'mean_absolute_rgb_error':round(mae,3)})
    temp.replace(dest)
    brief = [{k:r[k] for k in ('backend','variant','first','last','frames','spp','ev','renderMs','denoise')}
             for r in receipts]
    gpu = subprocess.check_output(['nvidia-smi','--query-gpu=name,driver_version',
        '--format=csv,noheader'],text=True).strip()
    rev = subprocess.check_output(['git','-C',str(args.checkout),'rev-parse','HEAD'],text=True).strip()
    receipt = {'checkout':rev,'host':subprocess.check_output(['hostname'],text=True).strip(),'gpu':gpu,
        'movie':dest.name,'sha256':sha(dest),'bytes':dest.stat().st_size,'video':codec,
        'native_segments':brief,'native_frames':len(covered),'cad_only_frames':len(frames)-len(shaded),
        'decoded_comparisons':checks}
    (job/(args.name+'.json')).write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))


if __name__ == '__main__':
    main()
