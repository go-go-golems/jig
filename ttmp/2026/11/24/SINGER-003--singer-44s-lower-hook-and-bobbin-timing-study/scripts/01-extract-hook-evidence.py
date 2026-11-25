"""Rebuild the selected Singer service figures and catalog cutouts from the verified PDFs."""
import argparse
import csv
import hashlib
from pathlib import Path

import fitz

SOURCES = {
    "catalog": "43d3949b1fea2177859893a72ce6b4b7d7d5ebcab4c9a9e01310f635764de0f9",
    "service": "8a8008a34bf8221f4df570dcd3d9d7001ce0e360f0b4f8025990234d85b3e281",
    "owner": "7355298c3ae1d7e7ba3f5cea3388b1c11563a0f53213d883787dcb2d6f2b6750",
}
# Rectangles in PDF points, relative to the top left of each displayed page.
VIEWS = [
    ("catalog", 14, (253, 144, 525, 420), 5, "G-holder-exploded"),
    ("catalog", 15, (30, 29, 540, 462), 2, "G-holder-table"),
    ("catalog", 26, (280, 75, 515, 320), 5, "M-bobbin-exploded"),
    ("catalog", 27, (32, 380, 590, 643), 2, "M-bobbin-table"),
    ("service", 16, (26, 69, 561, 435), 2, "3-10-ring-height"),
    ("service", 17, (26, 65, 560, 411), 2, "3-11-rise"),
    ("service", 18, (26, 68, 560, 457), 2, "3-12-clearance"),
    ("owner", 12, (22, 35, 497, 177), 2, "44S-bobbin-class"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in SOURCES:
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "sources")
    args = parser.parse_args()
    args.out.mkdir(exist_ok=True, parents=True)
    for name, expected in SOURCES.items():
        if hashlib.sha256(getattr(args, name).read_bytes()).hexdigest() != expected:
            parser.error(f"Unexpected {name} PDF checksum, required {expected}")
    with (args.out / "figure-index.tsv").open("w", newline="") as index:
        rows = csv.writer(index, delimiter="\t", lineterminator="\n")
        rows.writerow(["figure", "document", "pdf_page_one_based", "clip_points", "render_scale", "pdf_sha256"])
        for source, page, rect, scale, stem in VIEWS:
            with fitz.open(getattr(args, source)) as pdf:
                pix = pdf[page - 1].get_pixmap(matrix=fitz.Matrix(scale, scale), clip=fitz.Rect(rect))
                filename = stem + ".png"
                pix.save(args.out / filename)
                rows.writerow([filename, source, page, ",".join(map(str, rect)), scale, SOURCES[source]])


if __name__ == "__main__":
    main()
