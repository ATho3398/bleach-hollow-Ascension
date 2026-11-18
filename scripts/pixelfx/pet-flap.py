# 나비 펫 날갯짓 (C.480): 사용자가 찍은 한 장(날개 편 그림)을 몸통 세로축 기준으로 양 날개를 가로로 접었다 펴서 움직이는 webp 로 만든다.
# 사용: python3 scripts/pixelfx/pet-flap.py <한 장.png> <out.webp>
import sys, math, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA')); a[a[..., 3] < 128] = 0; a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
ys, xs = np.where(a[..., 3] > 0)
a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; H, W = a.shape[:2]
cx = W / 2                                   # 몸통 축 (그림 가운데)
# 움직임 (사용자 2026-11-18 17:1x "나비 너무 날라다닌다. 위치 옮기면서 나는거는 2초에 1번씩. 안그럴땐 좁은 위치에서 천천히 왔다갔다"):
# 8초 반복 = 2초 × 4자리. 자리마다 1.4초 머물며 좁게(좌우 ±3칸·위아래 ±1.5칸) 천천히 흔들리고 날개는 느리게 여닫다가,
# 0.6초 동안 빠른 날갯짓(1초 6.3번, 픽셀FX 나비 박자)으로 다음 자리로 옮겨 간다. 한 장 100ms.
SPOTS = [(-14, -4), (12, -9), (15, 6), (-10, 8)]
SEG, MOVE, D, FPS, STEP, BEATS = 2.0, 0.6, 8.0, 30, 3, 6.3
RX = max(abs(x) for x, _ in SPOTS) + 3; RY = max(abs(y) for _, y in SPOTS) + 2 + 3
CW, CH = W + 2 * RX + 4, H + 2 * RY + 2; CW += CW % 2; CH += CH % 2
def phase(t):
    i = int(t // SEG) % len(SPOTS); u = t % SEG
    return i, u, (u - (SEG - MOVE)) / MOVE          # 마지막 값 ≥ 0 이면 옮겨 가는 중
def fold(t):
    i, u, m = phase(t)
    if m >= 0:
        n = round(MOVE * BEATS)
        return 0.14 + 0.86 * (0.5 + 0.5 * math.cos(m * n * 2 * math.pi))
    return 0.78 + 0.22 * math.cos(u / (SEG - MOVE) * 2 * math.pi * 2)   # 머무는 동안 느리게 여닫음(1.4초에 두 번)
def at(t):
    i, u, m = phase(t); x0, y0 = SPOTS[i]; x1, y1 = SPOTS[(i + 1) % len(SPOTS)]
    A = t / D * 2 * math.pi
    sx, sy = 3 * math.sin(A * 3), 1.5 * math.sin(A * 5 + 0.7)            # 좁게 천천히 왔다갔다 (8초에 3번·5번이라 이음매 없음)
    if m < 0: return x0 + sx, y0 + sy
    k = m * m * (3 - 2 * m)
    return x0 + (x1 - x0) * k + sx, y0 + (y1 - y0) * k + sy - 3 * math.sin(math.pi * m)
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
c = Image.new('RGBA', (CW * 2 * 8, CH * 2 * 2), (96, 110, 128, 255))
for i in range(16): c.alpha_composite(frames[i * len(frames) // 16].resize((CW * 2, CH * 2), 0), ((i % 8) * CW * 2, (i // 8) * CH * 2))
c.save(out.replace('.webp', '') + '-preview.png'); print(out, W, H, (CW, CH), len(frames), '장')
