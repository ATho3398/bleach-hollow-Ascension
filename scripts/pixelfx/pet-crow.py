# 뼈 까마귀 (C.488): 사용자가 찍은 한 장(날개를 든 옆모습)을 잘라 날갯짓 2번 → 길게 활공하며 앞으로 미끄러지는 움직임으로 만든다.
# 날개 = 어깨 줄(HINGE) 위쪽 칸. 날갯짓 = 날개를 어깨 줄 기준으로 세로로 접었다(올림 1 → 수평 0.25) 아래로 뒤집어 내림(−0.7).
# 사용: python3 scripts/pixelfx/pet-crow.py <한 장.png> <out.webp>
import sys, math, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA'); im = im.crop(im.getbbox())
a = np.array(im); a[a[..., 3] < 128] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
H, W = a.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]
HINGE, WX1 = 11, 19                           # 어깨 줄 · 날개의 오른쪽 끝(자른 그림 칸)
wing = (a[..., 3] > 0) & (yy < HINGE) & (xx <= WX1)
body = a.copy(); body[wing] = 0
# 날개를 뗀 자리의 몸 윗선을 검정으로 닫는다
for x in range(W):
    col = np.where(body[:, x, 3] > 0)[0]
    if len(col) and wing[:, x].any(): body[col[0], x, :3] = 0
D, GLIDE, FRAME, DRIFT, PADX, PADT, PADB = 2.4, 0.75, 67, 8, 9, 3, 10
N = round(D * 1000 / FRAME); frames = []
def wingf(t):                                  # 날개 세로 배율: 1 = 든 그대로, 음수 = 아래로
    if t < GLIDE:
        u = (t / GLIDE * 2) % 1
        return math.cos(u * 2 * math.pi) * 0.85 + 0.15 if u < 0.5 else math.cos(u * 2 * math.pi) * 0.85 + 0.15
    g = (t - GLIDE) / (D - GLIDE)
    return 0.45 + 0.55 * max(0, (g - 0.8) / 0.2)            # 활공: 반쯤 편 채, 끝에 다시 든다
def drift(t):
    if t < GLIDE: k = t / GLIDE; return DRIFT - 2 * DRIFT * (k * k * (3 - 2 * k))
    g = (t - GLIDE) / (D - GLIDE); return -DRIFT + 2 * DRIFT * (1 - (1 - g) ** 3)
def lift(t):
    if t < GLIDE: return -2 * math.sin(math.pi * t / GLIDE) - (1 if wingf(t) < 0 else 0)
    return 2.2 * math.sin(math.pi * (t - GLIDE) / (D - GLIDE))
FW, FH = W + 2 * PADX, H + PADT + PADB
for i in range(N):
    t = i * FRAME / 1000; s = wingf(t); f = np.zeros((FH, FW, 4), np.uint8)
    ox = PADX + round(drift(t)); oy = PADT + round(lift(t))
    ys, xs = np.where(body[..., 3] > 0); f[ys + oy, xs + ox] = body[ys, xs]
    hh = max(1, round(abs(s) * HINGE))
    for r in range(hh):                         # 날개: 어깨 줄에서 r 칸 떨어진 줄 = 원본의 (r / |s|) 칸 위 줄
        sy = HINGE - 1 - min(HINGE - 1, int(r / max(0.05, abs(s))))
        ty = (HINGE - 1 - r) if s >= 0 else (HINGE + r)
        for x in np.where(wing[sy])[0]:
            if 0 <= ty + oy < FH: f[ty + oy, x + ox] = a[sy, x]
    frames.append(Image.fromarray(f))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=FRAME, loop=0, lossless=True)
cs = Image.new('RGBA', (FW * 4 * 8, FH * 4), (96, 110, 128, 255))
for i in range(8): cs.alpha_composite(frames[i * N // 8].resize((FW * 4, FH * 4), 0), (i * FW * 4, 0))
cs.save(out.replace('.webp', '') + '-preview.png'); print(out, (FW, FH), N, '장')
