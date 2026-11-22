import sys, glob, os
from PIL import Image, ImageDraw
ids = sys.argv[2:]; out = sys.argv[1]
fs = [f'/home/claude/shots/g/{i}.png' for i in ids] if ids else sorted(glob.glob('/home/claude/shots/g/*.png'))
fs = [f for f in fs if os.path.exists(f)]
W, H, cols = 320, 200, 4
rows = (len(fs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * (H + 14)), 'white'); d = ImageDraw.Draw(sheet)
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((W, H)); x = (i % cols) * W; y = (i // cols) * (H + 14)
    sheet.paste(im, (x, y + 14)); d.text((x + 3, y + 1), os.path.basename(f)[:-4], fill='black')
sheet.save(out); print(len(fs), sheet.size)
