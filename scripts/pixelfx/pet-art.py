# 펫 그림 뽑기 (C.477·C.478): pixelfx 시트(투명 프레임) → 불투명 도트만 → 48×48 움직이는 webp. 사용: python3 scripts/pixelfx/pet-art.py <records 폴더/이름> <out.webp> [건너뛰기=2]
import json, sys, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]; step = int(sys.argv[3]) if len(sys.argv) > 3 else 2
j = json.load(open(src + '.json')); sh = Image.open(src + '.png').convert('RGBA')
fr = j['frames']; fr = list(fr.values()) if isinstance(fr, dict) else fr
fps = j['meta']['pixelfx']['fps']
arr = []
for f in fr:
    r = f['frame']; a = np.array(sh.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])))
    a[a[..., 3] < 200] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0); arr.append(a)
al = np.max([a[..., 3] for a in arr], 0); ys, xs = np.where(al > 0)
w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1; N = 48
assert w <= N and h <= N, (w, h)
x0 = (xs.min() + xs.max() + 1) // 2 - N // 2; y0 = ys.min() - (N - h) // 2
fs = [Image.fromarray(a[y0:y0 + N, x0:x0 + N]) for a in arr[::step]]
fs[0].save(out, save_all=True, append_images=fs[1:], duration=round(1000 * step / fps), loop=0, lossless=True)
print(out, 'bbox', w, h, len(fs), '장')
c = Image.new('RGBA', (N * 4 * 8, N * 4), (96, 110, 128, 255))
for i in range(8): c.alpha_composite(fs[i * len(fs) // 8].resize((N * 4, N * 4), 0), (i * N * 4, 0))
c.save(out.replace('.webp', '') + '-preview.png')
