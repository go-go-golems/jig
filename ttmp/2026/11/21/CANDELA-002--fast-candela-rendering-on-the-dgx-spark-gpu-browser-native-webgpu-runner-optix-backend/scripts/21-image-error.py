# per-pixel and 8x8-block RMSE of displayed images (PNG) against a reference, in % of white
import subprocess, sys, math
import numpy as np
def load(p):
    w, h = map(int, subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',p],capture_output=True,text=True).stdout.strip().split(','))
    raw = subprocess.run(['ffmpeg','-v','error','-i',p,'-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, w, 3).astype(np.float64) / 255
ref = load(sys.argv[1])
for p in sys.argv[2:]:
    a = load(p)
    px = math.sqrt(((a - ref) ** 2).mean()) * 100
    H, W = (ref.shape[0] // 8) * 8, (ref.shape[1] // 8) * 8
    blk = lambda x: x[:H, :W].reshape(H // 8, 8, W // 8, 8, 3).mean(axis=(1, 3))
    bk = math.sqrt(((blk(a) - blk(ref)) ** 2).mean()) * 100
    print(f"{p.split('/')[-1]:14s} per-pixel RMSE {px:5.2f} %   8x8-block RMSE {bk:5.2f} %")
