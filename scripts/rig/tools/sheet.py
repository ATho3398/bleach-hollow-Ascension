import sys
from PIL import Image, ImageDraw
out, cols, *fs = sys.argv[1:]
cols = int(cols); ims = [Image.open(f) for f in fs]
w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
o = Image.new('RGB', (w * cols, h * rows), (0, 0, 0)); d = ImageDraw.Draw(o)
for i, (f, im) in enumerate(zip(fs, ims)):
    o.paste(im, ((i % cols) * w, (i // cols) * h)); d.text(((i % cols) * w + 6, (i // cols) * h + 4), f.rsplit('-', 1)[1].split('.')[0] + 'ms', fill=(0, 0, 0))
s = min(1, 2000 / o.width); o = o.resize((int(o.width * s), int(o.height * s))); o.save(out)
