# 나비 펫 날갯짓 (C.480): 사용자가 찍은 한 장(날개 편 그림)을 몸통 세로축 기준으로 양 날개를 가로로 접었다 펴서 움직이는 webp 로 만든다.
# 날갯짓 박자·위아래 뜨기는 custom/hell-butterfly(픽셀FX 나비)와 같다: 3.2초 반복, 0~0.95초·1.5~2.55초에 빠른 날갯짓, 나머지는 편 채 활공.
# 사용: python3 scripts/pixelfx/pet-flap.py <한 장.png> <out.webp>
import sys, math, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA')); a[a[..., 3] < 128] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
ys, xs = np.where(a[..., 3] > 0); N = 48
a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; H, W = a.shape[:2]; assert W <= N and H + 3 <= N, (W, H)
cx = W / 2                                   # 몸통 축 (그림 가운데)
D, BURSTS, FPS, STEP = 3.2, [(0, 0.95), (1.5, 2.55)], 30, 2
def fold(t):
    for s, e in BURSTS:
        if s <= t < e:
            n = round((e - s) * 6.3); ph = (t - s) / (e - s) * n
            return 0.14 + 0.86 * (0.5 + 0.5 * math.cos(ph * 2 * math.pi))
    return 1.0
def lift(t):
    return sum(-3 * math.sin(math.pi * min(1, max(0, (t - s) / (e - s)))) for s, e in BURSTS)
SUB = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
frames = []
for i in range(0, int(D * FPS), STEP):
    t = i / FPS; w = fold(t); f = np.zeros((N, N, 4), np.uint8)
    oy = (N - H) // 2 + 2 + round(lift(t)); ox = N // 2
    for y in range(H):
        for X in range(-N // 2, N // 2):
            d = X + 0.5                       # 축에서의 거리(칸 가운데)
            ad = abs(d)
            if ad <= 1: u = ad                # 몸통 2칸은 그대로
            else:
                u = None
                for k in SUB:                 # 접혔을 때 가는 부분이 빠지지 않게 한 칸 안을 여러 번 본다
                    q = 1 + (ad - 1 - 0.5 + k) / w
                    sx = int(math.floor(cx + math.copysign(q, d)))
                    if 0 <= sx < W and a[y, sx, 3]: u = q; break
                if u is None: continue
            sx = int(math.floor(cx + math.copysign(u, d)))
            if 0 <= sx < W and a[y, sx, 3] and 0 <= oy + y < N: f[oy + y, ox + X] = a[y, sx]
    frames.append(Image.fromarray(f))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 * STEP / FPS), loop=0, lossless=True)
c = Image.new('RGBA', (N * 4 * 8, N * 4), (96, 110, 128, 255))
for i in range(8): c.alpha_composite(frames[i * len(frames) // 8 + (1 if i == 1 else 0)].resize((N * 4, N * 4), 0), (i * N * 4, 0))
c.save(out.replace('.webp', '') + '-preview.png'); print(out, W, H, len(frames), '장')
