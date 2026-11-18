# 펫 그림 뽑기 (C.477·C.478): pixelfx 시트(투명 프레임) → 불투명 도트만 → 48×48 움직이는 webp. 사용: python3 scripts/pixelfx/pet-art.py <records 폴더/이름> <out.webp> [건너뛰기=2] [작은 덩어리 기준=5]
import json, sys, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]; step = int(sys.argv[3]) if len(sys.argv) > 3 else 2; SMALL = int(sys.argv[4]) if len(sys.argv) > 4 else 5
j = json.load(open(src + '.json')); sh = Image.open(src + '.png').convert('RGBA')
fr = j['frames']; fr = list(fr.values()) if isinstance(fr, dict) else fr
fps = j['meta']['pixelfx']['fps']
def body(a, small=None):
    small = SMALL if small is None else small
    # 본체만: 8방향으로 이어진 덩어리 중 small 칸 미만(날리는 가루·불티)은 지운다
    op = a[..., 3] > 0; H, W = op.shape; seen = np.zeros_like(op)
    for y, x in zip(*np.where(op)):
        if seen[y, x]: continue
        st = [(y, x)]; seen[y, x] = True; pts = []
        while st:
            cy, cx = st.pop(); pts.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    u, v = cy + dy, cx + dx
                    if 0 <= u < H and 0 <= v < W and op[u, v] and not seen[u, v]: seen[u, v] = True; st.append((u, v))
        if len(pts) < small:
            for cy, cx in pts: a[cy, cx] = 0
    return a
arr = []
for f in fr:
    r = f['frame']; a = np.array(sh.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])))
    a[a[..., 3] < 200] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0); arr.append(body(a))
al = np.max([a[..., 3] for a in arr], 0); ys, xs = np.where(al > 0)
w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
NW, NH = max(48, w + (w % 2)), max(48, h + (h % 2))   # 기본 48×48, 넘치면 그만큼 큰 틀 (게임 상자 = 그림 칸 수 × 배율, C.486)
x0 = (xs.min() + xs.max() + 1) // 2 - NW // 2; y0 = ys.min() - (NH - h) // 2
def cut(a):
    f = np.zeros((NH, NW, 4), np.uint8); H0, W0 = a.shape[:2]
    sy0, sx0 = max(0, y0), max(0, x0); sy1, sx1 = min(H0, y0 + NH), min(W0, x0 + NW)
    f[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = a[sy0:sy1, sx0:sx1]; return f
fs = [Image.fromarray(cut(a)) for a in arr[::step]]
N = max(NW, NH)
fs[0].save(out, save_all=True, append_images=fs[1:], duration=round(1000 * step / fps), loop=0, lossless=True)
print(out, 'bbox', w, h, len(fs), '장')
c = Image.new('RGBA', (N * 4 * 8, N * 4), (96, 110, 128, 255))
for i in range(8): c.alpha_composite(fs[i * len(fs) // 8].resize((NW * 4, NH * 4), 0), (i * N * 4, 0))
c.save(out.replace('.webp', '') + '-preview.png')
