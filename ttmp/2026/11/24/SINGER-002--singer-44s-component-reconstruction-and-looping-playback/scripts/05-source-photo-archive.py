#!/usr/bin/python3
"""Archive the untouched Singer JPEGs and index time-stamped movie frames.

Usage: 05-source-photo-archive.py ~/Downloads/singer-videos.zip [OUTPUT_DIR]
Requires ffprobe, ffmpeg and Pillow. Each sheet caption uses the presentation
timestamp of the decoded frame, relative to the first frame of its video.
"""
import argparse
from bisect import bisect_left
import csv
from hashlib import sha256
import json
import math
from pathlib import Path
import subprocess
import tempfile
from zipfile import ZipFile

from PIL import Image, ImageDraw, ImageFont


def digest(path):
    with path.open("rb") as stream:
        checksum = sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(block)
        return checksum.hexdigest()


def snapshot_member(archive, info, dest):
    checksum = sha256()
    with archive.open(info) as source, dest.open("wb") as target:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(block)
            target.write(block)
    assert dest.stat().st_size == info.file_size
    assert digest(dest) == checksum.hexdigest()
    return checksum.hexdigest()


def write_tsv(path, header, rows):
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, delimiter="\t", lineterminator="\n")
        writer.writerow(header)
        writer.writerows(tuple("-" if value == "" else value for value in row) for row in rows)


def sheet(clip, clip_id, period, dest, workdir):
    raw = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time",
        "-of", "json", str(clip),
    ])
    pts = [float(frame["best_effort_timestamp_time"])
           for frame in json.loads(raw)["frames"]]
    times = [timestamp - pts[0] for timestamp in pts]
    indices = [bisect_left(times, t) for t in range(0, int(times[-1]) + 1, period)]
    if indices[-1] != len(times) - 1:
        indices.append(len(times) - 1)
    selector = "+".join(f"eq(n\\,{index})" for index in indices)
    pattern = workdir / f"{clip_id}-%02d.png"
    subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(clip), "-map", "0:v:0", "-vf",
        f"select={selector},scale=272:-2", "-fps_mode", "passthrough",
        "-frames:v", str(len(indices)), str(pattern),
    ], check=True)
    cols = 4
    width, height, margin, top = 280, 516, 12, 72
    canvas = Image.new("RGB", (cols * width + margin * 2,
                               top + math.ceil(len(indices) / cols) * height + margin),
                       "#faf8f3")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype("DejaVuSans.ttf", 19)
    title = ImageFont.truetype("DejaVuSans.ttf", 23)
    draw.text((margin, 7), clip.name, fill="#18232a", font=title)
    draw.text((margin, 39), "Sampled video frames · elapsed seconds from first frame",
              fill="#445463", font=font)
    rows = []
    for position, index in enumerate(indices):
        r, c = divmod(position, cols)
        left = margin + c * width
        y = top + r * height
        with Image.open(str(pattern) % (position + 1)) as frame:
            frame.thumbnail((width - 8, height - 40))
            canvas.paste(frame, (left, y))
        label = f"{clip_id}.{position + 1:02d}"
        stamp = f"{times[index]:.3f}"
        draw.text((left, y + height - 36), f"{label}   {stamp} s", fill="#18232a", font=font)
        rows.append((label, dest.name, clip.name, "", index, stamp, r + 1, c + 1))
    canvas.save(dest, "JPEG", quality=90)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output_dir", type=Path, nargs="?",
                        default=Path(__file__).resolve().parents[1] / "sources")
    args = parser.parse_args()
    dest = args.output_dir
    photos = dest / "original-photos"
    photos.mkdir(parents=True, exist_ok=True)
    checksum = digest(args.archive)
    manifest, figures = [], []
    with ZipFile(args.archive) as archive, tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        jpgs = sorted(i.filename for i in archive.infolist() if i.filename.endswith(".jpg"))
        movies = sorted(i.filename for i in archive.infolist() if i.filename.endswith(".mov"))
        if len(jpgs) != 13 or len(movies) != 2:
            raise ValueError(f"Expected 13 JPEGs and 2 movies; found {len(jpgs)} and {len(movies)}")
        for i, name in enumerate(jpgs + movies):
            info = archive.getinfo(name)
            is_photo = name in jpgs
            output = (photos if is_photo else work) / Path(name).name
            member_hash = snapshot_member(archive, info, output)
            saved = output.relative_to(dest).as_posix() if is_photo else ""
            manifest.append((args.archive.name, checksum, name, info.file_size, member_hash, saved))
            if is_photo:
                with Image.open(output) as image:
                    capture = image.getexif().get(306, "")
                figures.append((f"P{i + 1:02d}", saved, name, capture, "", "", "", ""))
            else:
                number = movies.index(name) + 1
                figures.extend(sheet(output, f"V{number}", [2, 4][number - 1],
                                     dest / f"video-{number}-contact-sheet.jpg", work))
    write_tsv(dest / "archive-manifest.tsv",
              ["zip_name", "zip_sha256", "zip_member", "bytes", "member_sha256",
               "verbatim_path_relative_to_sources"], manifest)
    write_tsv(dest / "source-figures.tsv",
              ["figure", "path_relative_to_sources", "zip_member", "photo_exif_datetime",
               "video_frame_zero_based", "elapsed_seconds", "sheet_row", "sheet_column"], figures)


if __name__ == "__main__":
    main()
