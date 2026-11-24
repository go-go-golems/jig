#!/usr/bin/env python3
"""Locate candidate 1210/000 stock numbers and CN references in the supplied repair scan.

Usage: python3 catalog-locate.py '/path/to/compur shutter repair manual_text.pdf'
Requires Poppler pdftotext. Each page is numbered from one. Compare every candidate
with the printed page image, especially the rightmost revision digits.
"""
import argparse
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("pdf")
args = parser.parse_args()
result = subprocess.run(["pdftotext", "-layout", args.pdf, "-"], check=True,
                        stdout=subprocess.PIPE, encoding="utf-8")
stock = re.compile(r"(?<!\d)1210\s*[1-9]0\s*000\s*\d{3}(?:\s*\d{2})?(?!\d)")
target_type = re.compile(r"CN\s*[-–—]\s*1210\s*[-–—]\s*000", re.I)
for page, content in enumerate(result.stdout.split("\f"), 1):
    for line in content.splitlines():
        if stock.search(line) or target_type.search(line):
            print(f"{page:03}  {line.strip()}")
