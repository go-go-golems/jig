"""Compare display-RGB beauty PNGs before CAD compositing, from three SG-09 jobs.

Run with three job directories (64, 1024, 2048 SPP, respectively) and an
output directory. Requires Pillow with animated WebP support, DejaVu Sans
and NumPy. Input filenames match script 09 on the Spark.
"""
import argparse
import csv
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def beauty(job, row, box):
    with Image.open(job / 'beauty' / f'beauty.{row:04}.png') as image:
        if image.size != (1920, 1080):
            raise ValueError(f'Unexpected source dimensions for {job}, frame {row}')
        return image.convert('RGB').crop(box)


def residuals(crops):
    low, medium, high = [np.asarray(crop, dtype=np.int16) for crop in crops]
    return medium - low, high - medium


def metrics(writer, label, rows, box, values):
    writer.writerow([label, rows, *box, *(f'{float(value):.5f}' for value in values)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jobs', type=Path, nargs=3, metavar='JOB')
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype('DejaVuSans.ttf', 16)
    background = '#202124'
    headings = ['64 SPP', '1,024 SPP', '2,048 SPP', '|1,024 − 64| ×8', '|2,048 − 1,024| ×8']
    features = [
        (0, 'Assembled head · crank and spring', (840, 445, 1008, 597)),
        (204, 'Presser cutaway · bar and guide caps', (866, 585, 1034, 737)),
        (264, 'Sewing · rising needle, shank and foot', (844, 636, 1012, 788)),
    ]
    sheet = Image.new('RGB', (900, 612), background)
    draw = ImageDraw.Draw(sheet)
    for col, title in enumerate(headings):
        draw.text((12 + 178 * col, 8), title, font=font, fill='white')
    with (args.out / 'sg09-sampling.tsv').open('w') as stream:
        writer = csv.writer(stream, delimiter='\t', lineterminator='\n')
        writer.writerow(['measurement', 'frames', 'left', 'top', 'right_exclusive', 'bottom_exclusive',
                         'mean_abs_64_1024', 'mean_abs_1024_2048'])
        for index, (row, label, box) in enumerate(features):
            crops = [beauty(job, row, box) for job in args.jobs]
            differences = [np.abs(r) for r in residuals(crops)]
            metrics(writer, label, row, box, [d.mean() for d in differences])
            gains = [Image.fromarray(np.minimum(d * 8, 255).astype('uint8')) for d in differences]
            top = 42 + index * 192
            draw.text((12, top), f'{row / 24:.1f} s   {label}', font=font, fill='white')
            for col, image in enumerate(crops + gains):
                sheet.paste(image, (12 + 178 * col, top + 24))
        sheet.save(args.out / 'sg09-sampling-details.png')

        # A single fixed crop covers the complete moving head throughout these poses.
        box = (803, 363, 1063, 857)
        clip = []
        spatial = np.zeros(2)
        temporal = np.zeros(2)
        previous = None
        for row in range(252, 276):
            crops = [beauty(job, row, box) for job in args.jobs]
            residual = residuals(crops)
            spatial += [np.abs(r).mean() for r in residual]
            if previous is not None:
                temporal += [np.abs(r - old).mean() for r, old in zip(residual, previous)]
            previous = residual
            frame = Image.new('RGB', (824, 539), background)
            labels = ImageDraw.Draw(frame)
            for col, crop in enumerate(crops):
                left = 10 + 272 * col
                labels.text((left, 9), headings[col], font=font, fill='white')
                frame.paste(crop, (left, 35))
            clip.append(frame)
        metrics(writer, 'same-frame RGB difference', '252-275', box, spatial / len(clip))
        metrics(writer, 'change in RGB difference between adjacent frames', '252-275', box,
                temporal / (len(clip) - 1))
        # Preserve a 1,000 ms loop at the original average 24 fps.
        durations = [round((i + 1) * 1000 / 24) - round(i * 1000 / 24) for i in range(24)]
        clip[0].save(args.out / 'sg09-sampling-motion.webp', save_all=True, append_images=clip[1:],
                     duration=durations, loop=0, lossless=True, method=4)


if __name__ == '__main__':
    main()
