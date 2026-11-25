"""Register image landmarks to the two visible take-up pin centers (XZ plane)."""
import csv
from pathlib import Path
from PIL import Image, ImageDraw

ticket = Path(__file__).resolve().parents[1]
old = ticket.parent / "SINGER-001--singer-44s-upper-stitch-head" / "sources"
samples = [
    ("linkage-02s.jpg", (242,419), (265,272), (446,150)),
    ("linkage-08s.jpg", (295,417), (297,264), (451,96)),
]
with (ticket / "sources/takeup-landmarks.tsv").open("w") as f:
    out = csv.writer(f, delimiter="\t", lineterminator="\n")
    out.writerow(("frame", "pin_px", "support_px", "eye_px", "eye_parallel_over_span", "eye_perp_over_span"))
    for file, crank, support, eye in samples:
        img = Image.open(old / file)
        dx, dy = support[0]-crank[0], crank[1]-support[1]
        x, y = eye[0]-crank[0], crank[1]-eye[1]
        k = dx*dx + dy*dy
        out.writerow((file, crank, support, eye, round((x*dx+y*dy)/k,4), round((y*dx-x*dy)/k,4)))
        draw = ImageDraw.Draw(img)
        draw.line((crank, support, eye), fill="#ffcb58", width=2)
        for label, (x,y) in zip(("crank pin", "support pin", "thread eye"), (crank, support, eye)):
            draw.ellipse((x-5,y-5,x+5,y+5), outline="#ffcb58", width=2)
            draw.text((min(x+8,img.width-75),y+8),label,fill="white",stroke_width=2,stroke_fill="black")
        img.save(ticket / "sources" / ("annotated-"+file), quality=92)
