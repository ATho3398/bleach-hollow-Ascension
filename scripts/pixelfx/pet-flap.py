# 나비 펫 날갯짓 (C.480): 사용자가 찍은 한 장(날개 편 그림)을 몸통 세로축 기준으로 양 날개를 가로로 접었다 펴서 움직이는 webp 로 만든다.
# 사용: python3 scripts/pixelfx/pet-flap.py <한 장.png> <out.webp>
import sys, math, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA')); a[a[..., 3] < 128] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
ys, xs = np.where(a[..., 3] > 0)
a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; H, W = a.shape[:2]
cx = W / 2                                   # 몸통 축 (그림 가운데)
# 움직임 (사용자 2026-11-18 17:2x "한 위치에서 조금씩 왔다갔다 하다가, 2초마다 한번씩 저 8자 움직임 … 주변에 뿌리던 가루도 다시 살려줘"):
# 5.2초 반복 = 2초 제자리(좌우 ±3칸·위아래 ±1.5칸으로 천천히 흔들림, 날개는 느리게 여닫음) + 3.2초 8자 비행(픽셀FX critters/butterfly 의 길·날갯짓 그대로:
# 0~0.95초·1.5~2.55초에 1초 6.3번 날갯짓으로 떠오르고 나머지는 편 채 활공). 가루 = 날개에서 떨어져 아래로 흩날리며 반짝이다 사라지는 점. 한 장 100ms.
import random
HOVER, FLY, FPS, STEP, BEATS, BURSTS = 2.0, 3.2, 30, 3, 6.3, [(0, 0.95), (1.5, 2.55)]
D = HOVER + FLY
def path(tau):                                # 픽셀FX 나비의 길 (tau 0~3.2초), 시작점을 0,0 으로
    A = tau / FLY * 2 * math.pi
    lift = sum(-3 * math.sin(math.pi * min(1, max(0, (tau - s) / (e - s)))) for s, e in BURSTS)
    return 30 * math.sin(A) + 6 * math.sin(3 * A), 12 * math.sin(2 * A + 0.4) - 12 * math.sin(0.4) + lift
def flying(t): return (t % D) >= HOVER
def fold(t):
    t %= D
    if t < HOVER: return 0.78 + 0.22 * math.cos(t / HOVER * 2 * math.pi * 3)   # 제자리: 느리게 여닫음
    tau = t - HOVER
    for s, e in BURSTS:
        if s <= tau < e:
            n = round((e - s) * BEATS); ph = (tau - s) / (e - s) * n
            return 0.14 + 0.86 * (0.5 + 0.5 * math.cos(ph * 2 * math.pi))
    return 1.0
def at(t):
    t %= D
    if t < HOVER: return 3 * math.sin(t / HOVER * 2 * math.pi), 1.5 * math.sin(t / HOVER * 4 * math.pi)
    return path(t - HOVER)
# 틀: 나비가 닿는 범위 + 가루가 떨어지는 자리
PTS = [at(i / FPS) for i in range(int(D * FPS))]
X0, X1 = min(x for x, _ in PTS) - W / 2 - 10, max(x for x, _ in PTS) + W / 2 + 10
Y0, Y1 = min(y for _, y in PTS) - H / 2 - 2, max(y for _, y in PTS) + H / 2 + 26
CW, CH = int(math.ceil(X1 - X0)), int(math.ceil(Y1 - Y0)); CW += CW % 2; CH += CH % 2
OX, OY = -X0, -Y0                               # 나비 가운데(0,0)의 틀 안 자리
# 가루: 반복마다 같은 알갱이(이음매 없음). 8자 비행 중에도 제자리에서도
rnd = random.Random(7)
DUST = []
for i in range(64):
    born = (HOVER + rnd.random() * FLY) if i % 2 else rnd.random() * HOVER   # 절반은 제자리에서 (사용자 "가만히 날 때도 가루 날리게")
    bx, by = at(born)
    DUST.append(dict(born=born, life=rnd.uniform(1.0, 1.8), x=bx + rnd.uniform(-9, 9), y=by + rnd.uniform(-4, 8), ph=rnd.uniform(0, 6.28), kind=rnd.random()))
COLS = [(255, 255, 255), (232, 200, 255), (216, 48, 138)]   # 흰 반짝 · 연보라 · 자주 (나비 무늬 색)
SUB = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
frames = []
for i in range(0, int(round(D * FPS)), STEP):
    t = i / FPS; w = fold(t); f = np.zeros((CH, CW, 4), np.uint8)
    for d in DUST:                             # 가루 먼저(나비 뒤)
        age = (t - d['born']) % D
        if age >= d['life']: continue
        k = age / d['life']; tw = 0.5 + 0.5 * math.sin(age * 11 + d['ph'])
        x = int(round(OX + d['x'] + math.sin(age * 3 + d['ph']) * 1.5)); y = int(round(OY + d['y'] + 7 * age + 3 * age * age))
        al = min(1, k * 8) * (1 - k)
        if not (0 <= x < CW and 0 <= y < CH) or al < 0.12: continue
        c = COLS[0] if tw > 0.7 else COLS[2] if d['kind'] < 0.3 else COLS[1]
        f[y, x] = (*c, int(255 * min(1, al * 1.6)))
    px, py = at(t); ox = int(round(OX + px)); oy = int(round(OY + py - H / 2))
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
c = Image.new('RGBA', (CW * 2 * 8, CH * 2 * 2), (96, 110, 128, 255))
for i in range(16): c.alpha_composite(frames[i * len(frames) // 16].resize((CW * 2, CH * 2), 0), ((i % 8) * CW * 2, (i // 8) * CH * 2))
c.save(out.replace('.webp', '') + '-preview.png'); print(out, W, H, (CW, CH), len(frames), '장')
