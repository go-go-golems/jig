#!/usr/bin/env python3
# 07-exr-stats.py <file.exr> [channel] — stats for an uncompressed float32 scanline EXR (what Candela writes):
# Run with: uv run --with numpy python3 <this file> … (numpy is not installed system-wide on the Spark)
# divides out the exposure Candela records in the comments, reports coverage (A > 0) and the channel's mean over
# covered pixels and over the frame. Used to compare Candela's WebGPU AO against the OptiX spike's AO.
import re, struct, sys
import numpy as np
f, ch = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'R')
b = open(f, 'rb').read()
assert struct.unpack_from('<I', b, 0)[0] == 20000630
p, attrs = 8, {}
while b[p] != 0:
    n = b[p:b.index(0, p)].decode(); p += len(n) + 1
    t = b[p:b.index(0, p)].decode(); p += len(t) + 1
    sz = struct.unpack_from('<i', b, p)[0]; p += 4
    attrs[n] = (t, b[p:p + sz]); p += sz
p += 1
chans, q, cl = [], 0, attrs['channels'][1]
while cl[q] != 0:
    n = cl[q:cl.index(0, q)].decode(); q += len(n) + 1 + 16; chans.append(n)
assert attrs['compression'][1][0] == 0, 'compressed EXR not supported'
x0, y0, x1, y1 = struct.unpack('<4i', attrs['dataWindow'][1]); W, H = x1 - x0 + 1, y1 - y0 + 1
offs = struct.unpack_from(f'<{H}Q', b, p)
img = np.zeros((len(chans), H, W), np.float32)
for y, o in enumerate(offs):
    img[:, y, :] = np.frombuffer(b, '<f4', len(chans) * W, o + 8).reshape(len(chans), W)
m = re.search(r'exposure \(([0-9.eE+-]+)\)', attrs.get('comments', ('', b''))[1].decode(errors='ignore'))
k = float(m.group(1)) if m else 1.0
c, a = img[chans.index(ch)] / k, img[chans.index('A')] if 'A' in chans else None
cov = (a > 0) if a is not None else (c > 0)
print(f'{f}: {W}x{H} channels {",".join(chans)} exposure {k:g}')
print(f'  coverage {cov.mean():.4f}  {ch} mean(covered) {c[cov].mean():.4f}  mean(frame) {c.mean():.4f}  max {c.max():.4f}')
# optional: --pgm out.pgm writes the channel (exposure divided out, ×gain, sRGB-ish gamma) as 8-bit PGM
if '--pgm' in sys.argv:
    out, gain = sys.argv[sys.argv.index('--pgm') + 1], float(sys.argv[sys.argv.index('--gain') + 1]) if '--gain' in sys.argv else 1.0
    g = (np.clip(c * gain, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)
    open(out, 'wb').write(b'P5 %d %d 255\n' % (W, H) + g.tobytes())
    print('  →', out)
