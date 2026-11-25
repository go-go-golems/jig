"""Draw matched frame-zero crops from the 64- and 1024-spp native SG-09 outputs."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('first', type=Path)
    parser.add_argument('second', type=Path)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    box = (802, 400, 1062, 855)
    crops = []
    for path in (args.first, args.second):
        with Image.open(path) as image:
            if image.size != (1920, 1080):
                raise ValueError(f'Expected a 1080p beauty image at {path}')
            crops.append(image.convert('RGB').crop(box))
    difference = np.abs(np.asarray(crops[1], dtype=np.int16) - np.asarray(crops[0], dtype=np.int16))
    crops.append(Image.fromarray(np.minimum(difference * 8, 255).astype('uint8')))
    figure = Image.new('RGB', (820, 510), '#202124')
    draw = ImageDraw.Draw(figure)
    font = ImageFont.truetype('DejaVuSans.ttf', 17)
    for index, (crop, title) in enumerate(zip(crops, ('64 SPP', '1,024 SPP', 'Absolute difference ×8'))):
        x = 10 + index * 270
        figure.paste(crop, (x, 42))
        draw.text((x, 12), title, fill='white', font=font)
    figure.save(args.out)
    print(f'Mean absolute difference within the crop: {difference.mean():.2f} RGB levels')


if __name__ == '__main__':
    main()
