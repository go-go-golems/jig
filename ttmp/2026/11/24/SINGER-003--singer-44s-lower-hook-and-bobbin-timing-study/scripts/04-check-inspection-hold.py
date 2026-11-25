"""Compare decoded inspection frames with the original, labeled Stage image."""
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image

sources = Path(__file__).resolve().parents[1] / "sources"
movie = sources / "sg10-hook-pass.mp4"
probe = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-count_frames", "-show_streams", "-of", "json", movie,
]))["streams"][0]
assert (probe["codec_name"], probe["width"], probe["height"],
        probe["avg_frame_rate"], probe["nb_read_frames"]) == ("h264", 960, 600, "24/1", "144")
reference = np.asarray(Image.open(sources / "sg10-hook-pass.png").convert("RGB"), dtype=np.int16)
errors = []
for n in (0, 48, 71, 95, 143):
    rgb = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", movie, "-vf", f"select=eq(n\\,{n})",
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ])
    frame = np.frombuffer(rgb, dtype=np.uint8).reshape(reference.shape)
    error = float(np.mean(np.abs(frame - reference)))
    if 48 <= n <= 95:
        assert error < 3, (n, error)
    else:
        assert error > 4, (n, error)
    errors.append((n, round(error, 3)))
print("Decoded-frame differences against the event PNG (frame, mean RGB levels):", errors)
