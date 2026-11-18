# 떠 있는 펫 (C.482): 한 장 그림을 48×48 틀에 넣고 위아래로 천천히 둥실거리는 움직이는 webp 로 만든다 (사용자 "공중에 떠서 부유하면서 따라다니게 … 모션 없어도 됨").
# 사용: python3 scripts/pixelfx/pet-float.py <한 장.png> <out.webp> [폭=2칸] [주기=2.4초]
import sys, math, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]; AMP = int(sys.argv[3]) if len(sys.argv) > 3 else 2; D = float(sys.argv[4]) if len(sys.argv) > 4 else 2.4
im = Image.open(src).convert('RGBA'); im = im.crop(im.getbbox()); N = 48
assert im.width <= N and im.height + 2 * AMP <= N, im.size
frames = []
for i in range(round(D * 10)):               # 한 장 100ms
    f = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    dy = round(AMP * math.sin(i / (D * 10) * 2 * math.pi))
    f.alpha_composite(im, ((N - im.width) // 2, (N - im.height) // 2 + dy)); frames.append(f)
frames[0].save(out, save_all=True, append_images=frames[1:], duration=100, loop=0, lossless=True)
print(out, im.size, len(frames), '장')
