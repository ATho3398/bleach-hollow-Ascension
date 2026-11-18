# 나비 펫 날갯짓 (C.480): 사용자가 찍은 한 장(날개 편 그림)을 몸통 세로축 기준으로 양 날개를 가로로 접었다 펴서 움직이는 webp 로 만든다.
# 사용: python3 scripts/pixelfx/pet-flap.py <한 장.png> <out.webp>
import sys, math, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA')); a[a[..., 3] < 128] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
ys, xs = np.where(a[..., 3] > 0)
a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; H, W = a.shape[:2]
cx = W / 2                                   # 몸통 축 (그림 가운데)
# 픽셀FX critters/butterfly 와 같은 움직임 (사용자 2026-11-18 "픽셀fx에있는 나비 기반으로 움직여야지"): 3.2초 반복, 128×88 칸 안을 8자 비슷하게 돌아다니고
# 0~0.95초·1.5~2.55초에 빠른 날갯짓(1초 6.3번)으로 떠오르고 나머지는 편 채 활공. 30fps 중 3장에 1장(한 장 100ms) — 처음 보여 준 GIF 와 같은 박자.
CW, CH, D, BURSTS, FPS, STEP, BEATS = 128, 88, 3.2, [(0, 0.95), (1.5, 2.55)], 30, 3, 6.3
assert W + 72 <= CW and H + 30 <= CH + 12, (W, H)
def fold(t):
    for s, e in BURSTS:
        if s <= t < e:
            n = round((e - s) * BEATS); ph = (t - s) / (e - s) * n
            return 0.14 + 0.86 * (0.5 + 0.5 * math.cos(ph * 2 * math.pi))
    return 1.0
def at(t):
    A = t / D * 2 * math.pi
    lift = sum(-3 * math.sin(math.pi * min(1, max(0, (t - s) / (e - s)))) for s, e in BURSTS)
    return 30 * math.sin(A) + 6 * math.sin(3 * A), 12 * math.sin(2 * A + 0.4) + lift
SUB = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
frames = []
for i in range(0, int(D * FPS), STEP):
    t = i / FPS; w = fold(t); f = np.zeros((CH, CW, 4), np.uint8)
    px, py = at(t); ox = CW // 2 + round(px); oy = (CH - H) // 2 + round(py)
    for y in range(H):
        if not 0 <= oy + y < CH: continue
        for X in range(-W // 2 - 1, W // 2 + 2):
            d = X + 0.5; ad = abs(d)
            if ad <= 1: u = ad                # 몸통 2칸은 그대로
            else:
                u = None
                for k in SUB:                 # 접혔을 때 가는 부분이 빠지지 않게 한 칸 안을 여러 번 본다
                    q = 1 + (ad - 1 - 0.5 + k) / w
                    sx = int(math.floor(cx + math.copysign(q, d)))
                    if 0 <= sx < W and a[y, sx, 3]: u = q; break
                if u is None: continue
            sx = int(math.floor(cx + math.copysign(u, d)))
            if 0 <= sx < W and a[y, sx, 3] and 0 <= ox + X < CW: f[oy + y, ox + X] = a[y, sx]
    frames.append(Image.fromarray(f))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 * STEP / FPS), loop=0, lossless=True)
c = Image.new('RGBA', (CW * 2 * 4, CH * 2 * 2), (96, 110, 128, 255))
for i in range(8): c.alpha_composite(frames[i * len(frames) // 8].resize((CW * 2, CH * 2), 0), ((i % 4) * CW * 2, (i // 4) * CH * 2))
c.save(out.replace('.webp', '') + '-preview.png'); print(out, W, H, (CW, CH), len(frames), '장')
